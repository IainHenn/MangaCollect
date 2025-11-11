# 1. First, analyze everything (safe)
# python volume_cleaner.py analyze

# 2. Review the report, then clean high severity issues
# python volume_cleaner.py clean

# 3. For remaining issues, use interactive mode
# python volume_cleaner.py interactive

import json
import psycopg2
from psycopg2.extras import RealDictCursor
from collections import Counter
from datetime import datetime
from difflib import SequenceMatcher
import re

class VolumeCleanerScript:
    def __init__(self, config_file='config.json'):
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        db_config = config['database']
        self.conn = psycopg2.connect(
            host=db_config['host'],
            port=db_config['port'],
            database=db_config['database'],
            user=db_config['user'],
            password=db_config['password']
        )
        self.conn.autocommit = False
        
        self.dry_run = True  # Safety first - set to False to actually delete
        
    def normalize_title(self, title: str) -> str:
        """Normalize title for comparison"""
        if not title:
            return ""
        # Remove volume numbers
        title = re.sub(r'Vol\.?\s*\d+|Volume\s+\d+|Book\s+\d+|#\d+', '', title, flags=re.IGNORECASE)
        # Remove special chars
        title = re.sub(r'[^\w\s]', '', title)
        # Normalize whitespace
        title = re.sub(r'\s+', ' ', title)
        return title.lower().strip()
    
    def calculate_similarity(self, title1: str, title2: str) -> float:
        """Calculate similarity between two titles"""
        norm1 = self.normalize_title(title1)
        norm2 = self.normalize_title(title2)
        
        if not norm1 or not norm2:
            return 0.0
        
        return SequenceMatcher(None, norm1, norm2).ratio()
    
    def extract_publisher(self, volume_title: str) -> str:
        """Try to extract publisher or series name from volume title"""
        # Common patterns: "Series Name, Vol. X" or "Series Name Vol X"
        match = re.match(r'^([^,]+?)(?:,?\s*Vol|,?\s*Volume|,?\s*Book)', volume_title, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return volume_title
    
    def analyze_manga_volumes(self, manga_id: int, manga_title: str) -> dict:
        """Analyze all volumes for a manga and identify outliers"""
        
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    id, title, subtitle, publisher,
                    isbn_13, page_count, categories
                FROM volumes
                WHERE manga_id = %s
                ORDER BY volume_number NULLS LAST, published_date
            """, (manga_id,))
            
            volumes = cur.fetchall()
        
        if len(volumes) < 3:
            return {
                'manga_id': manga_id,
                'manga_title': manga_title,
                'total_volumes': len(volumes),
                'outliers': [],
                'reason': 'Too few volumes to analyze (need at least 3)'
            }
        
        # Analyze patterns
        publishers = [v['publisher'] for v in volumes if v['publisher']]
        series_names = [self.extract_publisher(v['title']) for v in volumes if v['title']]
        
        # Find most common patterns
        most_common_publisher = Counter(publishers).most_common(1)[0][0] if publishers else None
        most_common_series = Counter(series_names).most_common(1)[0][0] if series_names else None
        
        # Calculate similarity scores for each volume
        outliers = []
        
        for volume in volumes:
            issues = []
            severity = 0
            
            # Check title similarity to manga title
            if volume['title']:
                title_sim = self.calculate_similarity(manga_title, volume['title'])
                if title_sim < 0.5:
                    # Also check against most common series name
                    if most_common_series:
                        series_sim = self.calculate_similarity(most_common_series, volume['title'])
                        if series_sim < 0.5:
                            issues.append(f"Title mismatch (similarity: {title_sim:.2f})")
                            severity += 3
                    else:
                        issues.append(f"Title mismatch (similarity: {title_sim:.2f})")
                        severity += 3
            
            # Check publisher consistency
            if most_common_publisher and volume['publisher']:
                if volume['publisher'] != most_common_publisher:
                    pub_sim = self.calculate_similarity(most_common_publisher, volume['publisher'])
                    if pub_sim < 0.7:
                        issues.append(f"Publisher mismatch: '{volume['publisher']}' vs common '{most_common_publisher}'")
                        severity += 2
            
            # Check for missing ISBN (potential scraping error)
            if not volume['isbn_13']:
                issues.append("Missing ISBN-13")
                severity += 1
            
            # If multiple issues, likely a false positive
            if len(issues) >= 2 or severity >= 4:
                outliers.append({
                    'volume_id': volume['id'],
                    'title': volume['title'],
                    'publisher': volume['publisher'],
                    'isbn_13': volume['isbn_13'],
                    'issues': issues,
                    'severity': severity
                })
        
        return {
            'manga_id': manga_id,
            'manga_title': manga_title,
            'total_volumes': len(volumes),
            'outliers': outliers,
            'most_common_publisher': most_common_publisher,
            'most_common_series': most_common_series
        }
    
    def get_all_manga_with_volumes(self) -> list:
        """Get all manga that have volumes"""
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT 
                    m.id,
                    COALESCE(m.title_english, m.title_romaji) as title,
                    COUNT(v.id) as volume_count
                FROM manga m
                INNER JOIN volumes v ON m.id = v.manga_id
                GROUP BY m.id
                HAVING COUNT(v.id) >= 3
                ORDER BY COUNT(v.id) DESC
            """)
            return cur.fetchall()
    
    def delete_outlier_volumes(self, outlier_ids: list) -> int:
        """Delete outlier volumes from database and S3 bucket"""
        if not outlier_ids:
            return 0

        # Fetch S3 keys before deletion
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT thumbnail_s3_key FROM volumes
                WHERE id = ANY(%s)
            """, (outlier_ids,))
            s3_keys = [row['thumbnail_s3_key'] for row in cur.fetchall() if row['thumbnail_s3_key']]

        # Delete from S3
        if not self.dry_run and s3_keys:
            for key in s3_keys:
                try:
                    self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
                    print(f"    ✓ Deleted S3 object: {key}")
                except Exception as e:
                    print(f"    ✗ Error deleting S3 object {key}: {e}")

        # Delete from database
        with self.conn.cursor() as cur:
            cur.execute("""
                DELETE FROM volumes
                WHERE id = ANY(%s)
            """, (outlier_ids,))

            deleted_count = cur.rowcount

            if self.dry_run:
                self.conn.rollback()
                print(f"    [DRY RUN] Would delete {deleted_count} volumes")
            else:
                self.conn.commit()
                print(f"    ✓ Deleted {deleted_count} volumes")

            return deleted_count

    def run_cleanup(self, min_severity: int = 4, auto_delete: bool = False):
        """Run cleanup process"""
        print("=" * 80)
        print("MANGA VOLUME CLEANER")
        print("=" * 80)
        print(f"Mode: {'DRY RUN (no changes will be made)' if self.dry_run else 'LIVE (will delete volumes)'}")
        print(f"Minimum severity for auto-delete: {min_severity}")
        print("=" * 80)
        
        manga_list = self.get_all_manga_with_volumes()
        print(f"\nAnalyzing {len(manga_list)} manga with volumes...\n")
        
        total_outliers = 0
        total_deleted = 0
        manga_with_issues = []
        
        for manga in manga_list:
            analysis = self.analyze_manga_volumes(manga['id'], manga['title'])
            
            if analysis['outliers']:
                total_outliers += len(analysis['outliers'])
                manga_with_issues.append(analysis)
                
                print(f"\n📚 {analysis['manga_title']}")
                print(f"   Total volumes: {analysis['total_volumes']}")
                print(f"   Outliers found: {len(analysis['outliers'])}")
                print(f"   Common publisher: {analysis['most_common_publisher']}")
                print(f"   Common series name: {analysis['most_common_series']}")
                
                volumes_to_delete = []
                
                for outlier in analysis['outliers']:
                    severity_marker = "🔴" if outlier['severity'] >= 5 else "🟡" if outlier['severity'] >= 3 else "🟢"
                    print(f"\n   {severity_marker} OUTLIER (Severity: {outlier['severity']}):")
                    print(f"      Title: {outlier['title']}")
                    print(f"      Publisher: {outlier['publisher']}")
                    print(f"      ISBN: {outlier['isbn_13']}")
                    print(f"      Issues:")
                    for issue in outlier['issues']:
                        print(f"        - {issue}")
                    
                    # Auto-delete high severity outliers
                    if outlier['severity'] >= min_severity:
                        volumes_to_delete.append(outlier['volume_id'])
                
                if volumes_to_delete:
                    if auto_delete:
                        deleted = self.delete_outlier_volumes(volumes_to_delete)
                        total_deleted += deleted
                    else:
                        print(f"\n   ⚠️  Found {len(volumes_to_delete)} volumes eligible for deletion")
                        print(f"      Run with auto_delete=True to remove them")
        
        # Summary
        print("\n" + "=" * 80)
        print("CLEANUP SUMMARY")
        print("=" * 80)
        print(f"Manga analyzed: {len(manga_list)}")
        print(f"Manga with issues: {len(manga_with_issues)}")
        print(f"Total outliers found: {total_outliers}")
        print(f"Volumes deleted: {total_deleted if not self.dry_run else 0} (dry run)" if self.dry_run else f"Volumes deleted: {total_deleted}")
        print("=" * 80)
        
        if manga_with_issues and not auto_delete:
            print("\n💡 TIP: Review the issues above and run with auto_delete=True to clean them")
        
        return {
            'manga_analyzed': len(manga_list),
            'manga_with_issues': len(manga_with_issues),
            'total_outliers': total_outliers,
            'total_deleted': total_deleted,
            'issues_by_manga': manga_with_issues
        }
    
    def interactive_review(self):
        """Interactive mode to review and delete volumes one by one"""
        print("=" * 80)
        print("INTERACTIVE VOLUME REVIEW")
        print("=" * 80)
        
        manga_list = self.get_all_manga_with_volumes()
        
        for manga in manga_list:
            analysis = self.analyze_manga_volumes(manga['id'], manga['title'])
            
            if not analysis['outliers']:
                continue
            
            print(f"\n\n📚 {analysis['manga_title']}")
            print(f"   Total volumes: {analysis['total_volumes']}")
            print(f"   Outliers: {len(analysis['outliers'])}")
            
            for idx, outlier in enumerate(analysis['outliers'], 1):
                print(f"\n   Outlier {idx}/{len(analysis['outliers'])}:")
                print(f"   Title: {outlier['title']}")
                print(f"   Publisher: {outlier['publisher']}")
                print(f"   ISBN: {outlier['isbn_13']}")
                print(f"   Severity: {outlier['severity']}")
                print(f"   Issues:")
                for issue in outlier['issues']:
                    print(f"     - {issue}")
                
                if self.dry_run:
                    choice = input("\n   Delete this volume? (y/n/q to quit): ").lower()
                else:
                    choice = input("\n   [LIVE MODE] Delete this volume? (y/n/q to quit): ").lower()
                
                if choice == 'q':
                    print("\nExiting interactive review...")
                    return
                elif choice == 'y':
                    self.delete_outlier_volumes([outlier['volume_id']])
                else:
                    print("   Skipped")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

def main():
    import sys
    
    cleaner = VolumeCleanerScript('config.json')
    
    # Check command line arguments
    mode = sys.argv[1] if len(sys.argv) > 1 else 'analyze'
    
    if mode == 'analyze':
        # Dry run - just analyze and report
        cleaner.dry_run = True
        cleaner.run_cleanup(min_severity=4, auto_delete=False)
    
    elif mode == 'clean':
        # Live mode - actually delete high severity outliers
        print("\n⚠️  WARNING: This will DELETE volumes from the database!")
        confirm = input("Are you sure you want to proceed? (type 'DELETE' to confirm): ")
        
        if confirm == 'DELETE':
            cleaner.dry_run = False
            cleaner.run_cleanup(min_severity=4, auto_delete=True)
        else:
            print("Cancelled.")
    
    elif mode == 'interactive':
        # Interactive review mode
        print("\nStarting interactive review...")
        print("Mode: DRY RUN" if cleaner.dry_run else "Mode: LIVE")
        
        if not cleaner.dry_run:
            confirm = input("You are in LIVE mode. Changes will be permanent. Continue? (y/n): ")
            if confirm.lower() != 'y':
                print("Cancelled.")
                return
        
        cleaner.interactive_review()
    
    else:
        print("Usage:")
        print("  python volume_cleaner.py analyze      # Dry run analysis")
        print("  python volume_cleaner.py clean        # Delete high severity outliers")
        print("  python volume_cleaner.py interactive  # Review each outlier manually")
    
    cleaner.close()

if __name__ == "__main__":
    main()