import requests
from time import time, sleep
import json
import hashlib
import io
from typing import Dict, List, Optional
import boto3
from botocore.exceptions import ClientError
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
import sys
import signal
from difflib import SequenceMatcher

class RateLimiter:
    """Manage API rate limits"""
    def __init__(self, config_file='config.json'):
        # Load configuration
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        self.anilist_url = "https://graphql.anilist.co"
        self.google_books_url = "https://www.googleapis.com/books/v1/volumes"
        
        # Google Books API key
        google_books_config = config.get('google_books', {})
        self.google_books_api_key = google_books_config.get('api_key')
        
        if not self.google_books_api_key:
            print("⚠️  WARNING: No Google Books API key found in config")
            print("   You'll be limited to 10 results per request")
            print("   Get a free API key at: https://console.cloud.google.com/apis/credentials")
        else:
            print(f"✓ Google Books API key loaded")
        
        # Database connection
        db_config = config['database']
        self.conn = None
        self.connect_db(db_config)
        
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        self.limits = config.get('rate_limits', {})
        self.state_file = 'rate_limit_state.json'
        self.state = self.load_state()
    
    def load_state(self) -> Dict:
        """Load rate limit state from file"""
        try:
            with open(self.state_file, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return {
                'google_books': {'count': 0, 'reset_time': None},
                'anilist': {'count': 0, 'reset_time': None}
            }
    
    def save_state(self):
        """Save rate limit state to file"""
        with open(self.state_file, 'w') as f:
            json.dump(self.state, f, indent=2)
    
    def check_and_wait(self, service: str) -> bool:
        """Check if we can make request, wait if needed"""
        now = datetime.now().isoformat()
        service_state = self.state.get(service, {'count': 0, 'reset_time': None})
        
        # Check if we need to reset counter
        if service_state['reset_time']:
            reset_time = datetime.fromisoformat(service_state['reset_time'])
            if datetime.now() >= reset_time:
                service_state['count'] = 0
                service_state['reset_time'] = None
        
        # Get limit for this service
        limit_config = self.limits.get(service, {})
        max_requests = limit_config.get('max_requests', 1000)
        period_hours = limit_config.get('period_hours', 24)
        
        # Check if we've hit the limit
        if service_state['count'] >= max_requests:
            if not service_state['reset_time']:
                # Set reset time
                reset_time = datetime.now() + timedelta(hours=period_hours)
                service_state['reset_time'] = reset_time.isoformat()
                self.save_state()
            
            # Calculate wait time
            reset_time = datetime.fromisoformat(service_state['reset_time'])
            wait_seconds = (reset_time - datetime.now()).total_seconds()
            
            if wait_seconds > 0:
                print(f"\n⚠️  Rate limit reached for {service}")
                print(f"   Waiting until {reset_time.strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"   ({wait_seconds/3600:.1f} hours remaining)")
                sleep(wait_seconds)
                
                # Reset after waiting
                service_state['count'] = 0
                service_state['reset_time'] = None
        
        # Increment counter
        service_state['count'] += 1
        self.state[service] = service_state
        self.save_state()
        
        # Apply request delay
        delay = limit_config.get('delay_seconds', 1.0)
        sleep(delay)
        
        return True

class MangaScraper:
    def __init__(self, config_file='config.json'):
        # Load configuration
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        self.anilist_url = "https://graphql.anilist.co"
        self.google_books_url = "https://www.googleapis.com/books/v1/volumes"
        
        # Database connection
        db_config = config['database']
        self.conn = None
        self.connect_db(db_config)
        
        # AWS S3 setup
        aws_config = config['aws']
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=aws_config['access_key'],
            aws_secret_access_key=aws_config['secret_key'],
            region_name=aws_config['region']
        )
        self.bucket_name = aws_config['bucket_name']
        
        # Rate limiter
        self.rate_limiter = RateLimiter(config_file)
        
        # Scraping configuration
        self.scrape_config = config.get('scraping', {})
        self.initial_fetch_count = self.scrape_config.get('initial_fetch_count', 500)
        self.update_interval_hours = self.scrape_config.get('update_interval_hours', 24)
        self.batch_size = self.scrape_config.get('batch_size', 50)
        self.publisher_match_threshold = self.scrape_config.get('publisher_match_threshold', 0.8)
        
        # Load valid publishers
        self.valid_publishers = self.load_valid_publishers()
        
        # Track state
        self.running = True
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
    
    def signal_handler(self, sig, frame):
        """Handle shutdown signals gracefully"""
        print("\n\n🛑 Shutdown signal received. Finishing current operation...")
        self.running = False
    
    def connect_db(self, db_config: Dict):
        """Connect to PostgreSQL RDS"""
        try:
            self.conn = psycopg2.connect(
                host=db_config['host'],
                port=db_config['port'],
                database=db_config['database'],
                user=db_config['user'],
                password=db_config['password']
            )
            self.conn.autocommit = False
            print("✓ Connected to RDS database")
        except Exception as e:
            print(f"✗ Database connection failed: {e}")
            raise
    
    def load_valid_publishers(self) -> List[str]:
        """Load valid manga publishers from database"""
        try:
            with self.conn.cursor() as cur:
                cur.execute("SELECT name FROM manga_distributors ORDER BY name")
                publishers = [row[0] for row in cur.fetchall()]
                print(f"✓ Loaded {len(publishers)} valid publishers from database")
                return publishers
        except Exception as e:
            print(f"⚠️  Could not load publishers from database: {e}")
            print("   Continuing without publisher validation")
            return []
    
    def get_current_manga_count(self) -> int:
        """Get current count of manga in database"""
        try:
            with self.conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM manga")
                return cur.fetchone()[0]
        except Exception as e:
            print(f"Error getting manga count: {e}")
            return 0
    
    def fuzzy_match_publisher(self, publisher: str) -> Optional[tuple]:
        """
        Fuzzy match a publisher name against valid publishers.
        Returns (matched_publisher, score) if score > threshold, else None
        """
        if not publisher or not self.valid_publishers:
            return None
        
        publisher_lower = publisher.lower().strip()
        best_match = None
        best_score = 0.0
        
        for valid_publisher in self.valid_publishers:
            valid_lower = valid_publisher.lower().strip()
            
            # Calculate similarity score
            score = SequenceMatcher(None, publisher_lower, valid_lower).ratio()
            
            # Also check if one contains the other (partial match)
            if publisher_lower in valid_lower or valid_lower in publisher_lower:
                score = max(score, 0.85)
            
            if score > best_score:
                best_score = score
                best_match = valid_publisher
        
        # Return match only if above threshold
        if best_score >= self.publisher_match_threshold:
            return (best_match, best_score)
        
        return None
    
    def upload_to_s3(self, image_url: str, key: str) -> Optional[str]:
        """Download image and upload to S3"""
        try:
            response = requests.get(image_url, timeout=10)
            if response.status_code != 200:
                return None
            
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=response.content,
                ContentType=response.headers.get('content-type', 'image/jpeg'),
                CacheControl='max-age=31536000'
            )
            
            return key
        except Exception as e:
            print(f"  ✗ Error uploading to S3: {e}")
            return None
    
    def generate_s3_key(self, identifier: str, image_type: str, url: str) -> str:
        """
        Generate S3 key following structure:
        manga/
        ├── covers/
        │   └── {anilist_id}/
        │       └── {timestamp}_{hash}.{ext}
        └── volumes/
            └── {isbn_or_hash}/
                └── {timestamp}.{ext}
        """
        ext = url.split('.')[-1].split('?')[0]
        if ext not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
            ext = 'jpg'
        
        url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
        timestamp = int(time())
        
        if image_type == 'covers':
            return f"manga/covers/{identifier}/{timestamp}_{url_hash}.{ext}"
        else:  # volumes
            return f"manga/volumes/{identifier}/{timestamp}.{ext}"
    
    def fetch_anilist_manga(self, page: int = 1, per_page: int = 50) -> Dict:
        """Fetch manga from AniList GraphQL API"""
        self.rate_limiter.check_and_wait('anilist')
        
        query = '''
        query ($page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
                pageInfo {
                    hasNextPage
                    total
                }
                media(type: MANGA, sort: POPULARITY_DESC) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    description
                    genres
                    tags {
                        name
                    }
                    staff(perPage: 25) {
                        edges {
                            role
                            node {
                                name {
                                    full
                                }
                            }
                        }
                    }
                    startDate {
                        year
                        month
                        day
                    }
                    endDate {
                        year
                        month
                        day
                    }
                    countryOfOrigin
                    coverImage {
                        large
                    }
                    averageScore
                    meanScore
                    popularity
                    volumes
                    chapters
                    status
                    isAdult
                    siteUrl
                    relations {
                        edges {
                            relationType
                            node {
                                type
                                title {
                                    romaji
                                }
                            }
                        }
                    }
                }
            }
        }
        '''
        
        variables = {'page': page, 'perPage': per_page}
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        try:
            response = requests.post(
                self.anilist_url,
                json={'query': query, 'variables': variables},
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                # Check for GraphQL errors
                if 'errors' in data:
                    error_msg = data['errors'][0].get('message', 'Unknown GraphQL error')
                    raise Exception(f"AniList GraphQL error: {error_msg}")
                return data
            elif response.status_code == 429:
                # Rate limited
                retry_after = int(response.headers.get('Retry-After', 60))
                print(f"  Rate limited by AniList, waiting {retry_after}s...")
                sleep(retry_after)
                return self.fetch_anilist_manga(page, per_page)
            elif response.status_code == 400:
                # Bad request - log response for debugging
                print(f"  ✗ AniList 400 Error Response: {response.text}")
                raise Exception(f"AniList API 400 error: {response.text[:500]}")
            else:
                print(f"  ✗ AniList {response.status_code} Error: {response.text[:200]}")
                raise Exception(f"AniList API error {response.status_code}: {response.text[:200]}")
        except requests.exceptions.RequestException as e:
            raise Exception(f"Network error calling AniList: {e}")
    
    def get_manga_for_update(self) -> List[Dict]:
        """Get manga that need volume updates (ONLY from initial 500)"""
        hours_ago = datetime.now() - timedelta(hours=self.update_interval_hours)
        
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                # FIXED: Only get manga from the top 500 by popularity
                cur.execute("""
                    WITH top_manga AS (
                        SELECT id 
                        FROM manga 
                        ORDER BY popularity DESC NULLS LAST 
                        LIMIT %s
                    )
                    SELECT m.id, m.anilist_id, m.title_romaji, m.title_english, 
                           m.authors, m.status, m.last_checked_for_volumes
                    FROM manga m
                    INNER JOIN top_manga tm ON m.id = tm.id
                    WHERE (m.last_checked_for_volumes IS NULL 
                           OR m.last_checked_for_volumes < %s)
                    AND m.status IN ('RELEASING', 'FINISHED', 'CANCELLED')
                    ORDER BY 
                        CASE 
                            WHEN m.status = 'RELEASING' THEN 1
                            WHEN m.last_checked_for_volumes IS NULL THEN 2
                            ELSE 3
                        END,
                        m.popularity DESC NULLS LAST
                    LIMIT %s
                """, (self.initial_fetch_count, hours_ago, self.batch_size))
                
                return cur.fetchall()
        except Exception as e:
            print(f"Error fetching manga for update: {e}")
            return []
    
    def has_english_release(self, manga: Dict) -> bool:
        """Check if manga likely has English release"""
        english_title = manga.get('title', {}).get('english') if isinstance(manga.get('title'), dict) else manga.get('title_english')
        
        if english_title:
            return True
        
        popularity = manga.get('popularity', 0)
        if popularity > 10000:
            return True
        
        return False
    
    def search_google_books(self, title: str, author: str = None, start_index: int = 0) -> Optional[Dict]:
        """Search Google Books API with rate limiting and pagination support"""
        self.rate_limiter.check_and_wait('google_books')
        
        search_query = f"{title}"
        if author:
            search_query += f" {author}"
        
        params = {
            'q': search_query,
            'maxResults': 40,
            'startIndex': start_index,
            'printType': 'books',
            'langRestrict': 'en',
            'orderBy': 'newest'
        }
        
        # Add API key if available
        if self.google_books_api_key:
            params['key'] = self.google_books_api_key
        
        try:
            response = requests.get(self.google_books_url, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'items': data.get('items', []),
                    'totalItems': data.get('totalItems', 0)
                }
            elif response.status_code == 429:
                print(f"  Google Books rate limit hit")
                return None
            elif response.status_code == 403:
                error_data = response.json()
                error_message = error_data.get('error', {}).get('message', '')
                
                if 'API key' in error_message or 'quota' in error_message.lower():
                    print(f"  ✗ Google Books API error: {error_message}")
                    print(f"     Check your API key and quotas at: https://console.cloud.google.com/")
                else:
                    print(f"  Google Books 403 error: {error_message}")
                return None
            else:
                print(f"  Google Books API error: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"  Error searching Google Books: {e}")
            return None
    
    def search_all_google_books_volumes(self, title: str, author: str = None, max_volumes: int = 200) -> List[Dict]:
        """Search Google Books with pagination to get all volumes"""
        all_books = []
        start_index = 0
        max_results_per_request = 40
        
        while start_index < max_volumes:
            result = self.search_google_books(title, author, start_index)
            
            if not result:
                break
            
            items = result.get('items', [])
            total_items = result.get('totalItems', 0)
            
            if not items:
                break
            
            all_books.extend(items)
            
            # Check if we've got all available results
            if len(all_books) >= total_items or len(items) < max_results_per_request:
                break
            
            start_index += max_results_per_request
            
            # Don't paginate too much for very popular series
            if start_index >= max_volumes:
                print(f"    Reached max volume limit ({max_volumes})")
                break
        
        return all_books
    
    def parse_date(self, date_dict: Dict) -> Optional[str]:
        """Parse date to SQL format"""
        if not date_dict or not date_dict.get('year'):
            return None
        
        year = date_dict.get('year')
        month = date_dict.get('month', 1)
        day = date_dict.get('day', 1)
        
        try:
            return f"{year}-{month:02d}-{day:02d}"
        except:
            return None
    
    def insert_or_update_manga(self, manga_data: Dict) -> Optional[int]:
        """Insert or update manga in database - ONLY if under limit"""
        try:
            with self.conn.cursor() as cur:
                cur.execute("SELECT id FROM manga WHERE anilist_id = %s", (manga_data['anilist_id'],))
                existing = cur.fetchone()
                
                if existing:
                    # Update existing
                    cur.execute("""
                        UPDATE manga SET
                            title_romaji = %s, title_english = %s, title_native = %s,
                            description = %s, status = %s, total_volumes = %s,
                            total_chapters = %s, average_score = %s, mean_score = %s,
                            popularity = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE anilist_id = %s
                    """, (
                        manga_data['title_romaji'], manga_data['title_english'], 
                        manga_data['title_native'], manga_data['description'],
                        manga_data['status'], manga_data['total_volumes'],
                        manga_data['total_chapters'], manga_data['average_score'],
                        manga_data['mean_score'], manga_data['popularity'],
                        manga_data['anilist_id']
                    ))
                    self.conn.commit()
                    return existing[0]
                
                # FIXED: Check if we've already reached the limit before inserting
                current_count = self.get_current_manga_count()
                if current_count >= self.initial_fetch_count:
                    print(f"  ⚠️  Manga limit reached ({self.initial_fetch_count}), skipping insert")
                    return None
                
                # Insert new
                insert_query = """
                INSERT INTO manga (
                    anilist_id, title_romaji, title_english, title_native,
                    description, authors, artists, genres, tags,
                    serialization, start_date, end_date, status,
                    country_of_origin, total_volumes, total_chapters,
                    average_score, mean_score, is_adult, popularity,
                    cover_image_url, cover_image_s3_key, anilist_url, adaptations
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
                """
                
                cur.execute(insert_query, (
                    manga_data['anilist_id'], manga_data['title_romaji'],
                    manga_data['title_english'], manga_data['title_native'],
                    manga_data['description'], manga_data['authors'],
                    manga_data['artists'], manga_data['genres'],
                    manga_data['tags'], manga_data['serialization'],
                    manga_data['start_date'], manga_data['end_date'],
                    manga_data['status'], manga_data['country_of_origin'],
                    manga_data['total_volumes'], manga_data['total_chapters'],
                    manga_data['average_score'], manga_data['mean_score'],
                    manga_data['is_adult'], manga_data['popularity'],
                    manga_data['cover_image_url'], manga_data['cover_image_s3_key'],
                    manga_data['anilist_url'], json.dumps(manga_data['adaptations'])
                ))
                
                manga_id = cur.fetchone()[0]
                self.conn.commit()
                print(f"  ✓ Inserted manga (id: {manga_id})")
                return manga_id
                
        except Exception as e:
            print(f"  ✗ Error with manga: {e}")
            self.conn.rollback()
            return None
    
    def update_manga_check_timestamp(self, manga_id: int):
        """Update last checked timestamp for manga"""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    "UPDATE manga SET last_checked_for_volumes = CURRENT_TIMESTAMP WHERE id = %s",
                    (manga_id,)
                )
                self.conn.commit()
        except Exception as e:
            print(f"  Error updating timestamp: {e}")
            self.conn.rollback()
    
    def insert_volume(self, manga_id: int, volume_data: Dict) -> bool:
        """Insert volume if not exists and publisher matches"""
        try:
            # Check publisher match first
            publisher = volume_data.get('publisher')
            if publisher and self.valid_publishers:
                match_result = self.fuzzy_match_publisher(publisher)
                
                if not match_result:
                    print(f"    ✗ Skipped (publisher '{publisher}' not recognized)")
                    return False
                
                matched_publisher, score = match_result
                if score < self.publisher_match_threshold:
                    print(f"    ✗ Skipped (publisher match score {score:.2f} < {self.publisher_match_threshold})")
                    return False
                
                # Update publisher to matched value
                volume_data['publisher'] = matched_publisher
                if score < 1.0:
                    print(f"    📝 Publisher matched: '{publisher}' → '{matched_publisher}' (score: {score:.2f})")
            
            with self.conn.cursor() as cur:
                if volume_data.get('isbn_13'):
                    cur.execute(
                        "SELECT id FROM volumes WHERE isbn_13 = %s",
                        (volume_data['isbn_13'],)
                    )
                    if cur.fetchone():
                        return False
                
                insert_query = """
                INSERT INTO volumes (
                    manga_id, title, subtitle, volume_number, isbn_13, isbn_10,
                    page_count, publisher, published_date, description,
                    language, categories, price_amount, price_currency,
                    country, preview_link, info_link, thumbnail_url, thumbnail_s3_key
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) ON CONFLICT (manga_id, isbn_13) DO NOTHING
                """
                
                cur.execute(insert_query, (
                    manga_id, volume_data['title'], volume_data['subtitle'],
                    volume_data['volume_number'], volume_data['isbn_13'],
                    volume_data['isbn_10'], volume_data['page_count'],
                    volume_data['publisher'], volume_data['published_date'],
                    volume_data['description'], volume_data['language'],
                    volume_data['categories'], volume_data['price_amount'],
                    volume_data['price_currency'], volume_data['country'],
                    volume_data['preview_link'], volume_data['info_link'],
                    volume_data['thumbnail_url'], volume_data['thumbnail_s3_key']
                ))
                
                inserted = cur.rowcount > 0
                self.conn.commit()
                
                if inserted:
                    print(f"    ✓ New volume: {volume_data['title']}")
                
                return inserted
                
        except Exception as e:
            self.conn.rollback()
            return False
    
    def process_manga(self, manga: Dict) -> Dict:
        """Process manga data"""
        authors = []
        artists = []
        for edge in manga.get('staff', {}).get('edges', []):
            role = edge.get('role', '').lower()
            name = edge.get('node', {}).get('name', {}).get('full')
            
            if name:
                if 'story' in role or 'original creator' in role:
                    authors.append(name)
                elif 'art' in role:
                    artists.append(name)
        
        adaptations = []
        for edge in manga.get('relations', {}).get('edges', []):
            if edge.get('relationType') in ['ADAPTATION', 'ALTERNATIVE']:
                node = edge.get('node', {})
                adaptations.append({
                    'type': node.get('type'),
                    'title': node.get('title', {}).get('romaji')
                })
        
        cover_url = manga.get('coverImage', {}).get('large')
        cover_s3_key = None
        
        if cover_url:
            s3_key = self.generate_s3_key(str(manga['id']), 'covers', cover_url)
            uploaded_key = self.upload_to_s3(cover_url, s3_key)
            if uploaded_key:
                cover_s3_key = uploaded_key
        
        return {
            'anilist_id': manga['id'],
            'title_romaji': manga['title'].get('romaji'),
            'title_english': manga['title'].get('english'),
            'title_native': manga['title'].get('native'),
            'description': manga.get('description'),
            'authors': authors,
            'artists': artists,
            'genres': manga.get('genres', []),
            'tags': [tag['name'] for tag in manga.get('tags', [])],
            'serialization': manga.get('serialization'),
            'start_date': self.parse_date(manga.get('startDate')),
            'end_date': self.parse_date(manga.get('endDate')),
            'status': manga.get('status'),
            'country_of_origin': manga.get('countryOfOrigin'),
            'total_volumes': manga.get('volumes'),
            'total_chapters': manga.get('chapters'),
            'average_score': manga.get('averageScore'),
            'mean_score': manga.get('meanScore'),
            'is_adult': manga.get('isAdult'),
            'popularity': manga.get('popularity'),
            'cover_image_url': cover_url,
            'cover_image_s3_key': cover_s3_key,
            'anilist_url': manga.get('siteUrl'),
            'adaptations': adaptations
        }
    
    def extract_volume_number(self, title: str) -> Optional[int]:
        """Extract volume number from title"""
        import re
        match = re.search(r'Vol\.?\s*(\d+)|Volume\s+(\d+)', title, re.IGNORECASE)
        if match:
            return int(match.group(1) or match.group(2))
        return None
    
    def process_volume(self, book: Dict) -> Dict:
        """Process Google Books volume"""
        volume_info = book.get('volumeInfo', {})
        sale_info = book.get('saleInfo', {})
        
        isbn_13 = None
        isbn_10 = None
        for identifier in volume_info.get('industryIdentifiers', []):
            isbn_type = identifier.get('type')
            if isbn_type == 'ISBN_13':
                isbn_13 = identifier.get('identifier')
            elif isbn_type == 'ISBN_10':
                isbn_10 = identifier.get('identifier')
        
        thumbnail_url = volume_info.get('imageLinks', {}).get('thumbnail')
        thumbnail_s3_key = None
        
        if thumbnail_url:
            unique_id = isbn_13 or hashlib.md5(volume_info.get('title', '').encode()).hexdigest()[:12]
            s3_key = self.generate_s3_key(unique_id, 'volumes', thumbnail_url)
            uploaded_key = self.upload_to_s3(thumbnail_url, s3_key)
            if uploaded_key:
                thumbnail_s3_key = uploaded_key
        
        price_amount = None
        price_currency = None
        list_price = sale_info.get('listPrice')
        if list_price:
            price_amount = list_price.get('amount')
            price_currency = list_price.get('currencyCode')
        
        published_date = None
        pub_date_str = volume_info.get('publishedDate')
        if pub_date_str:
            try:
                published_date = datetime.strptime(pub_date_str, '%Y-%m-%d').date()
            except:
                try:
                    published_date = datetime.strptime(pub_date_str, '%Y-%m').date()
                except:
                    try:
                        published_date = datetime.strptime(pub_date_str, '%Y').date()
                    except:
                        pass
        
        return {
            'title': volume_info.get('title'),
            'subtitle': volume_info.get('subtitle'),
            'volume_number': self.extract_volume_number(volume_info.get('title', '')),
            'isbn_13': isbn_13,
            'isbn_10': isbn_10,
            'page_count': volume_info.get('pageCount'),
            'publisher': volume_info.get('publisher'),
            'published_date': published_date,
            'description': volume_info.get('description'),
            'language': volume_info.get('language'),
            'categories': volume_info.get('categories', []),
            'price_amount': price_amount,
            'price_currency': price_currency,
            'country': sale_info.get('country'),
            'preview_link': volume_info.get('previewLink'),
            'info_link': volume_info.get('infoLink'),
            'thumbnail_url': thumbnail_url,
            'thumbnail_s3_key': thumbnail_s3_key
        }
    
    def initial_scrape(self):
        """Initial scrape of top manga"""
        print("\n" + "="*60)
        print("INITIAL SCRAPE - Fetching top manga")
        print("="*60)
        
        start_time = datetime.now()
        manga_count = 0
        volume_count = 0
        errors = 0
        
        per_page = 50
        pages = (self.initial_fetch_count + per_page - 1) // per_page
        
        for page in range(1, pages + 1):
            if not self.running:
                break
            
            # FIXED: Check if we've reached the limit before fetching more
            current_count = self.get_current_manga_count()
            if current_count >= self.initial_fetch_count:
                print(f"\n✓ Reached manga limit ({self.initial_fetch_count}), stopping initial scrape")
                break
            
            try:
                print(f"\nFetching page {page}/{pages}...")
                data = self.fetch_anilist_manga(page, per_page)
                manga_list = data['data']['Page']['media']
                
                for manga in manga_list:
                    if not self.running:
                        break
                    
                    # FIXED: Check limit again before processing each manga
                    current_count = self.get_current_manga_count()
                    if current_count >= self.initial_fetch_count:
                        print(f"\n✓ Reached manga limit ({self.initial_fetch_count}), stopping")
                        break
                    
                    print(f"\n  Processing: {manga['title'].get('romaji')}")
                    manga_data = self.process_manga(manga)
                    manga_id = self.insert_or_update_manga(manga_data)
                    
                    if manga_id:
                        manga_count += 1
                        
                        if self.has_english_release(manga):
                            volumes = self.check_for_new_volumes(manga_id, manga_data)
                            volume_count += volumes
                    else:
                        errors += 1
                
            except Exception as e:
                print(f"Error on page {page}: {e}")
                errors += 1
        
        print(f"\nInitial scrape complete: {manga_count} manga, {volume_count} volumes")
    
    def check_for_new_volumes(self, manga_id: int, manga_data: Dict) -> int:
        """Check for new volumes for a manga"""
        search_title = manga_data.get('title_english') or manga_data.get('title_romaji')
        author = manga_data['authors'][0] if manga_data.get('authors') else None
        
        # Get expected volume count from AniList if available
        expected_volumes = manga_data.get('total_volumes')
        max_search = 200  # Default max
        
        if expected_volumes and expected_volumes > 0:
            # Search for a bit more than expected (in case of special editions)
            max_search = min(expected_volumes + 20, 300)
        
        print(f"    Searching Google Books (expecting ~{expected_volumes or '?'} volumes)...")
        books = self.search_all_google_books_volumes(search_title, author, max_search)
        new_volumes = 0
        skipped_publisher = 0
        
        if books:
            print(f"    Found {len(books)} potential volumes in Google Books")
            
            # Filter for actual matches
            filtered_books = self.filter_matching_volumes(books, search_title, author)
            
            print(f"    Filtered to {len(filtered_books)} matching volumes")
            
            for book in filtered_books:
                volume_data = self.process_volume(book)
                
                # Check if publisher is valid before inserting
                publisher = volume_data.get('publisher')
                if publisher and self.valid_publishers:
                    match_result = self.fuzzy_match_publisher(publisher)
                    if not match_result:
                        skipped_publisher += 1
                        continue
                
                if self.insert_volume(manga_id, volume_data):
                    new_volumes += 1
            
            if skipped_publisher > 0:
                print(f"    ⚠️  Skipped {skipped_publisher} volumes due to unrecognized publishers")
        
        self.update_manga_check_timestamp(manga_id)
        return new_volumes
    
    def normalize_title(self, title: str) -> str:
        """Normalize title for comparison"""
        import re
        # Remove volume numbers, special chars, extra spaces
        title = re.sub(r'Vol\.?\s*\d+|Volume\s+\d+', '', title, flags=re.IGNORECASE)
        title = re.sub(r'[^\w\s]', '', title)
        title = re.sub(r'\s+', ' ', title)
        return title.lower().strip()
    
    def calculate_title_similarity(self, title1: str, title2: str) -> float:
        """Calculate similarity ratio between two titles"""
        norm1 = self.normalize_title(title1)
        norm2 = self.normalize_title(title2)
        
        # Direct comparison
        similarity = SequenceMatcher(None, norm1, norm2).ratio()
        
        # Check if one title contains the other (for subtitles)
        if norm1 in norm2 or norm2 in norm1:
            similarity = max(similarity, 0.85)
        
        return similarity
    
    def filter_matching_volumes(self, books: List[Dict], search_title: str, author: str = None) -> List[Dict]:
        """Filter books to only include volumes that actually match the manga series"""
        matching_books = []
        
        for book in books:
            volume_info = book.get('volumeInfo', {})
            book_title = volume_info.get('title', '')
            book_authors = volume_info.get('authors', [])
            
            # Skip if no title
            if not book_title:
                continue
            
            # Calculate title similarity
            similarity = self.calculate_title_similarity(search_title, book_title)
            
            # Very strict threshold - must be very similar
            if similarity < 0.7:
                continue
            
            # If we have author info, verify it matches
            if author and book_authors:
                author_match = False
                author_lower = author.lower()
                
                for book_author in book_authors:
                    if author_lower in book_author.lower() or book_author.lower() in author_lower:
                        author_match = True
                        break
                
                # If author is specified and doesn't match, skip (unless title is nearly identical)
                if not author_match and similarity < 0.9:
                    continue
            
            # Additional check: ensure it's actually a volume (has volume number or is book format)
            book_title_lower = book_title.lower()
            has_volume_indicator = any([
                'vol' in book_title_lower,
                'volume' in book_title_lower,
                'book' in book_title_lower,
                '#' in book_title_lower,
                volume_info.get('printType') == 'BOOK'
            ])
            
            # Also check categories for manga/comics
            categories = volume_info.get('categories', [])
            is_manga_category = any([
                'comics' in str(cat).lower() or 
                'manga' in str(cat).lower() or
                'graphic novel' in str(cat).lower()
                for cat in categories
            ])
            
            # Accept if it has volume indicator OR is in manga category with high similarity
            if has_volume_indicator or (is_manga_category and similarity > 0.8):
                matching_books.append(book)
        
        return matching_books
    
    def update_scrape(self):
        """Update scrape - check existing manga for new volumes"""
        print("\n" + "="*60)
        print("UPDATE SCRAPE - Checking for new volumes")
        print("="*60)
        
        start_time = datetime.now()
        manga_count = 0
        volume_count = 0
        errors = 0
        
        manga_list = self.get_manga_for_update()
        print(f"Found {len(manga_list)} manga to check (from top {self.initial_fetch_count})")
        
        for manga in manga_list:
            if not self.running:
                break
            
            try:
                print(f"\nChecking: {manga['title_romaji'] or manga['title_english']}")
                
                if self.has_english_release(manga):
                    volumes = self.check_for_new_volumes(manga['id'], manga)
                    volume_count += volumes
                else:
                    self.update_manga_check_timestamp(manga['id'])
                
                manga_count += 1
                
            except Exception as e:
                print(f"  Error: {e}")
                errors += 1
        
        print(f"\nUpdate complete: {manga_count} checked, {volume_count} new volumes")
    
    def run_continuous(self):
        """Run scraper continuously"""
        print("\n" + "="*60)
        print("MANGA SCRAPER - CONTINUOUS MODE")
        print("="*60)
        print(f"Manga limit: {self.initial_fetch_count}")
        print(f"Update interval: {self.update_interval_hours} hours")
        print(f"Batch size: {self.batch_size} manga per update")
        print(f"Publisher match threshold: {self.publisher_match_threshold}")
        print("Press Ctrl+C to stop gracefully")
        print("="*60)
        
        # Check if initial scrape needed
        try:
            with self.conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM manga")
                manga_count = cur.fetchone()[0]
                
                print(f"\nCurrent manga in database: {manga_count}")
                
                if manga_count < self.initial_fetch_count:
                    print(f"Need {self.initial_fetch_count - manga_count} more manga - running initial scrape...")
                    self.initial_scrape()
                else:
                    print(f"✓ Already have {self.initial_fetch_count}+ manga, skipping initial scrape")
        except Exception as e:
            print(f"Error checking manga count: {e}")
        
        # Continuous update loop
        cycle = 1
        while self.running:
            try:
                print(f"\n\n{'='*60}")
                print(f"UPDATE CYCLE #{cycle}")
                print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"{'='*60}")
                
                self.update_scrape()
                
                if self.running:
                    print(f"\n💤 Sleeping for {self.update_interval_hours} hours...")
                    print(f"   Next check at: {(datetime.now() + timedelta(hours=self.update_interval_hours)).strftime('%Y-%m-%d %H:%M:%S')}")
                    
                    # Sleep in small intervals to allow graceful shutdown
                    sleep_seconds = self.update_interval_hours * 3600
                    interval = 60  # Check every minute for shutdown signal
                    
                    for _ in range(int(sleep_seconds / interval)):
                        if not self.running:
                            break
                        sleep(interval)
                
                cycle += 1
                
            except KeyboardInterrupt:
                print("\n\nShutdown requested...")
                self.running = False
                break
            except Exception as e:
                print(f"\n✗ Error in update cycle: {e}")
                print("Waiting 5 minutes before retry...")
                sleep(300)
        
        print("\n" + "="*60)
        print("Scraper stopped gracefully")
        print("="*60)
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("Database connection closed")

def main():
    print("""
    ╔══════════════════════════════════════════════════════════╗
    ║         MANGA COLLECTION SCRAPER v2.2                    ║
    ║         LIMITED TO TOP 500 MANGA FROM ANILIST            ║
    ╚══════════════════════════════════════════════════════════╝
    """)
    
    try:
        scraper = MangaScraper('config.json')
        scraper.run_continuous()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n✗ Fatal error: {e}")
    finally:
        if 'scraper' in locals():
            scraper.close()

if __name__ == "__main__":
    main()