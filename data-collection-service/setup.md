# Manga Scraper Setup Guide

## Prerequisites

- Python 3.8+
- AWS Account with RDS and S3 access
- PostgreSQL database

## Installation Steps

### 1. Install Dependencies

```bash
pip install boto3 psycopg2-binary requests
```

Or use requirements.txt:
```bash
pip install -r requirements.txt
```

**requirements.txt:**
```
boto3==1.28.0
psycopg2-binary==2.9.7
requests==2.31.0
```

### 2. Set Up AWS

#### Create S3 Bucket
```bash
aws s3 mb s3://manga-collection-images --region us-east-1
```

Or via AWS Console:
1. Go to S3 Console
2. Click "Create bucket"
3. Name: `manga-collection-images`
4. Region: `us-east-1`
5. Uncheck "Block all public access" (if you want public images)
6. Create bucket

#### Create IAM User
1. Go to IAM Console
2. Create new user: `manga-scraper`
3. Attach policies:
   - `AmazonS3FullAccess` (or custom policy from S3_FOLDER_STRUCTURE.md)
4. Create access key
5. Save Access Key ID and Secret Access Key

### 3. Set Up RDS PostgreSQL

#### Create RDS Instance
```bash
aws rds create-db-instance \
    --db-instance-identifier manga-db \
    --db-instance-class db.t3.micro \
    --engine postgres \
    --engine-version 15.3 \
    --master-username manga_user \
    --master-user-password YourSecurePassword123! \
    --allocated-storage 20 \
    --publicly-accessible
```

Or via AWS Console:
1. Go to RDS Console
2. Click "Create database"
3. Choose PostgreSQL
4. Template: Free tier (or your preference)
5. DB instance identifier: `manga-db`
6. Master username: `manga_user`
7. Master password: Create secure password
8. Instance type: `db.t3.micro`
9. Storage: 20 GB
10. Public access: Yes (for development)
11. Create database

#### Configure Security Group
1. Go to RDS instance
2. Click on VPC security group
3. Add inbound rule:
   - Type: PostgreSQL
   - Port: 5432
   - Source: Your IP address (or 0.0.0.0/0 for testing)

### 4. Create Database and Tables

Connect to your RDS instance:
```bash
psql -h your-rds-endpoint.us-east-1.rds.amazonaws.com -U manga_user -d postgres
```

Create database:
```sql
CREATE DATABASE manga_db;
\c manga_db
```

Run the SQL from `create_tables.sql`:
```bash
psql -h your-rds-endpoint.us-east-1.rds.amazonaws.com -U manga_user -d manga_db -f create_tables.sql
```

Or copy/paste the SQL directly into psql.

### 5. Configure config.json

Edit `config.json` with your credentials:

```json
{
  "database": {
    "host": "your-actual-rds-endpoint.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "database": "manga_db",
    "user": "manga_user",
    "password": "YourActualPassword123!"
  },
  "aws": {
    "access_key": "AKIAIOSFODNN7EXAMPLE",
    "secret_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "region": "us-east-1",
    "bucket_name": "manga-collection-images"
  },
  "rate_limits": {
    "google_books": {
      "max_requests": 1000,
      "period_hours": 24,
      "delay_seconds": 1.0
    },
    "anilist": {
      "max_requests": 90,
      "period_hours": 1,
      "delay_seconds": 0.8
    }
  },
  "scraping": {
    "initial_fetch_count": 1000,
    "update_interval_hours": 24,
    "batch_size": 50
  }
}
```

**⚠️ SECURITY WARNING**: Never commit `config.json` to git!

Add to `.gitignore`:
```
config.json
rate_limit_state.json
*.pyc
__pycache__/
.env
```

### 6. Test Connection

Create a test script `test_connection.py`:

```python
import json
import boto3
import psycopg2

# Test DB
with open('config.json') as f:
    config = json.load(f)

try:
    conn = psycopg2.connect(
        host=config['database']['host'],
        port=config['database']['port'],
        database=config['database']['database'],
        user=config['database']['user'],
        password=config['database']['password']
    )
    print("✓ Database connection successful")
    conn.close()
except Exception as e:
    print(f"✗ Database connection failed: {e}")

# Test S3
try:
    s3 = boto3.client(
        's3',
        aws_access_key_id=config['aws']['access_key'],
        aws_secret_access_key=config['aws']['secret_key'],
        region_name=config['aws']['region']
    )
    s3.list_objects_v2(Bucket=config['aws']['bucket_name'], MaxKeys=1)
    print("✓ S3 connection successful")
except Exception as e:
    print(f"✗ S3 connection failed: {e}")
```

Run test:
```bash
python test_connection.py
```

## Running the Scraper

### Development/Testing Mode (first run)
```bash
# Run with smaller dataset for testing
python manga_scraper.py
```

This will:
1. Create tables if they don't exist
2. Check if manga exist in DB
3. If empty, run initial scrape (1000 manga by default)
4. Start continuous monitoring

### Production Mode

For production, use a process manager:

#### Using systemd (Linux)

Create `/etc/systemd/system/manga-scraper.service`:
```ini
[Unit]
Description=Manga Collection Scraper
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/manga-scraper
ExecStart=/usr/bin/python3 /path/to/manga-scraper/manga_scraper.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable manga-scraper
sudo systemctl start manga-scraper
sudo systemctl status manga-scraper
```

View logs:
```bash
sudo journalctl -u manga-scraper -f
```

#### Using Docker

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY manga_scraper.py .
COPY config.json .

CMD ["python", "manga_scraper.py"]
```

Build and run:
```bash
docker build -t manga-scraper .
docker run -d --name manga-scraper --restart unless-stopped manga-scraper
```

#### Using screen (simple)
```bash
screen -S manga-scraper
python manga_scraper.py
# Press Ctrl+A, then D to detach

# Reattach later:
screen -r manga-scraper
```

## Monitoring

### Check Scraper Logs
```sql
SELECT 
    run_type,
    manga_processed,
    volumes_added,
    errors_count,
    started_at,
    completed_at,
    EXTRACT(EPOCH FROM (completed_at - started_at))/60 as duration_minutes
FROM scraper_log
ORDER BY started_at DESC
LIMIT 10;
```

### Check Database Stats
```sql
-- Total counts
SELECT 
    (SELECT COUNT(*) FROM manga) as total_manga,
    (SELECT COUNT(*) FROM volumes) as total_volumes;

-- Recent additions
SELECT 
    DATE(created_at) as date,
    COUNT(*) as volumes_added
FROM volumes
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Manga needing updates
SELECT COUNT(*) 
FROM manga 
WHERE last_checked_for_volumes < NOW() - INTERVAL '24 hours'
   OR last_checked_for_volumes IS NULL;
```

### Monitor S3 Storage
```bash
aws s3 ls s3://manga-collection-images/manga/ --recursive --summarize
```

### Monitor Rate Limits
Check `rate_limit_state.json`:
```bash
cat rate_limit_state.json
```

## Troubleshooting

### Connection Issues

**Problem**: Can't connect to RDS
- Check security group allows your IP
- Verify RDS endpoint is correct
- Ensure RDS is publicly accessible (if connecting from outside VPC)

**Problem**: Can't upload to S3
- Verify IAM user has S3 permissions
- Check bucket name is correct
- Ensure bucket exists in correct region

### Rate Limit Issues

**Problem**: Google Books rate limit hit too quickly
- Increase `delay_seconds` in config.json
- Reduce `batch_size` in config.json
- The scraper will automatically pause when limit is reached

**Problem**: AniList rate limit errors
- AniList allows 90 requests/minute
- Scraper defaults to 0.8s delay (conservative)
- Will automatically retry after rate limit period

### Performance Issues

**Problem**: Scraper is too slow
- Increase `batch_size` (but watch rate limits)
- Decrease `delay_seconds` (but watch rate limits)
- Run multiple instances with different manga ranges (advanced)

**Problem**: Database queries slow
- Indexes are created automatically
- Consider increasing RDS instance size
- Vacuum database periodically:
  ```sql
  VACUUM ANALYZE manga;
  VACUUM ANALYZE volumes;
  ```

## Maintenance

### Regular Tasks

**Weekly**:
- Check scraper logs for errors
- Monitor S3 storage costs
- Verify volumes are being added

**Monthly**:
- Review and optimize rate limits
- Check for orphaned S3 objects
- Backup database:
  ```bash
  pg_dump -h your-rds-endpoint.rds.amazonaws.com -U manga_user manga_db > backup.sql
  ```

**As Needed**:
- Update `initial_fetch_count` to get more manga
- Adjust `update_interval_hours` based on your needs
- Clean up duplicate volumes (should be prevented by constraints)

## Cost Estimates

### AWS Costs (Monthly)
- RDS db.t3.micro: ~$15-20
- S3 storage (10GB): ~$0.23
- Data transfer (minimal): <$1
- **Total: ~$16-21/month**

### Free Tier (First 12 months)
- RDS: 750 hours/month of db.t3.micro
- S3: 5GB storage
- **Effectively free for first year if within limits**

## Support

For issues:
1. Check logs in `scraper_log` table
2. Review rate limit state in `rate_limit_state.json`
3. Test connections with `test_connection.py`
4. Check AWS CloudWatch for RDS/S3 metrics