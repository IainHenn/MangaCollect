package main

import (
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type UserManga struct {
	ID            int       `json:"id"`
	UserID        int       `json:"user_id"`
	MangaVolumeID int       `json:"manga_volume_id"`
	Status        string    `json:"status"`
	AddedAt       time.Time `json:"added_at"`
}

// Define Volume struct with all columns from volumes table
type Volume struct {
	ID             int             `json:"id"`
	MangaID        int             `json:"manga_id"`
	Title          string          `json:"title"`
	Subtitle       sql.NullString  `json:"subtitle"`
	VolumeNumber   sql.NullInt64   `json:"volume_number"`
	ISBN13         sql.NullString  `json:"isbn_13"`
	ISBN10         sql.NullString  `json:"isbn_10"`
	PageCount      sql.NullInt64   `json:"page_count"`
	Publisher      sql.NullString  `json:"publisher"`
	PublishedDate  sql.NullTime    `json:"published_date"`
	Description    sql.NullString  `json:"description"`
	Language       sql.NullString  `json:"language"`
	Categories     sql.NullString  `json:"categories"`
	PriceAmount    sql.NullFloat64 `json:"price_amount"`
	PriceCurrency  sql.NullString  `json:"price_currency"`
	Country        sql.NullString  `json:"country"`
	PreviewLink    sql.NullString  `json:"preview_link"`
	InfoLink       sql.NullString  `json:"info_link"`
	ThumbnailURL   sql.NullString  `json:"thumbnail_url"`
	ThumbnailS3Key sql.NullString  `json:"thumbnail_s3_key"`
	CreatedAt      sql.NullTime    `json:"created_at"`
	UpdatedAt      sql.NullTime    `json:"updated_at"`
}

type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// Helper to validate user from cookie JWT only
func getUserIDFromCookie(c *gin.Context) (int, bool) {
	godotenv.Load()
	tokenString, err := c.Cookie("access_token")
	if err != nil {
		c.JSON(401, gin.H{"error": "No token"})
		return 0, false
	}
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		return []byte(os.Getenv("SECRET_KEY")), nil
	})
	if err != nil || !token.Valid {
		c.JSON(401, gin.H{"error": "Invalid token"})
		return 0, false
	}
	claims, ok := token.Claims.(*Claims)
	if !ok {
		c.JSON(401, gin.H{"error": "Invalid token claims"})
		return 0, false
	}
	return claims.UserID, true
}

func addToCollection(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	volumeID := c.Param("volume_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(`INSERT INTO user_manga (user_id, manga_volume_id, status, added_at)
		VALUES ($1, $2, 'collected', NOW())
		ON CONFLICT (user_id, manga_volume_id) DO UPDATE SET status='collected', added_at=NOW()`,
		userID, volumeID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to add to collection"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func getCollectionVolume(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	volumeID := c.Param("volume_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	var v Volume
	err = conn.QueryRow(`
		SELECT v.id, v.manga_id, v.title, v.subtitle, v.volume_number, v.isbn_13, v.isbn_10, v.page_count,
		       v.publisher, v.published_date, v.description, v.language, v.categories, v.price_amount,
		       v.price_currency, v.country, v.preview_link, v.info_link, v.thumbnail_url, v.thumbnail_s3_key,
		       v.created_at, v.updated_at
		FROM user_manga um
		JOIN volumes v ON um.manga_volume_id = v.id
		WHERE um.user_id = $1 AND um.manga_volume_id = $2 AND um.status = 'collected'
	`, userID, volumeID).Scan(
		&v.ID, &v.MangaID, &v.Title, &v.Subtitle, &v.VolumeNumber, &v.ISBN13, &v.ISBN10, &v.PageCount,
		&v.Publisher, &v.PublishedDate, &v.Description, &v.Language, &v.Categories, &v.PriceAmount,
		&v.PriceCurrency, &v.Country, &v.PreviewLink, &v.InfoLink, &v.ThumbnailURL, &v.ThumbnailS3Key,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		c.JSON(404, gin.H{"error": "Not found"})
		return
	}
	c.JSON(200, v)
}

func deleteCollectionVolume(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	volumeID := c.Param("volume_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(`DELETE FROM user_manga WHERE user_id = $1 AND manga_volume_id = $2 AND status = 'collected'`, userID, volumeID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to delete"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func getAllCollection(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	rows, err := conn.Query(`
		SELECT v.id, v.manga_id, v.title, v.subtitle, v.volume_number, v.isbn_13, v.isbn_10, v.page_count,
		       v.publisher, v.published_date, v.description, v.language, v.categories, v.price_amount,
		       v.price_currency, v.country, v.preview_link, v.info_link, v.thumbnail_url, v.thumbnail_s3_key,
		       v.created_at, v.updated_at
		FROM user_manga um
		JOIN volumes v ON um.manga_volume_id = v.id
		WHERE um.user_id = $1 AND um.status = 'collected'
	`, userID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to get collection"})
		return
	}
	fmt.Println(userID)
	fmt.Println(rows)

	defer rows.Close()

	var result []Volume
	for rows.Next() {
		var v Volume
		err := rows.Scan(
			&v.ID, &v.MangaID, &v.Title, &v.Subtitle, &v.VolumeNumber, &v.ISBN13, &v.ISBN10, &v.PageCount,
			&v.Publisher, &v.PublishedDate, &v.Description, &v.Language, &v.Categories, &v.PriceAmount,
			&v.PriceCurrency, &v.Country, &v.PreviewLink, &v.InfoLink, &v.ThumbnailURL, &v.ThumbnailS3Key,
			&v.CreatedAt, &v.UpdatedAt,
		)
		fmt.Println(v)
		if err == nil {
			result = append(result, v)
		} else {
			fmt.Println(err)
		}
	}

	fmt.Println(result)
	c.JSON(200, result)
}

func addToWishlist(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	volumeID := c.Param("volume_id")

	conn, err := get_db_conn()
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(`INSERT INTO user_manga (user_id, manga_volume_id, status, added_at)
		VALUES ($1, $2, 'wishlisted', NOW())
		ON CONFLICT (user_id, manga_volume_id) DO UPDATE SET status='wishlisted', added_at=NOW()`,
		userID, volumeID)
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to add to wishlist"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func getWishlistVolume(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	volumeID := c.Param("volume_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	var v Volume
	err = conn.QueryRow(`
		SELECT v.id, v.manga_id, v.title, v.subtitle, v.volume_number, v.isbn_13, v.isbn_10, v.page_count,
		       v.publisher, v.published_date, v.description, v.language, v.categories, v.price_amount,
		       v.price_currency, v.country, v.preview_link, v.info_link, v.thumbnail_url, v.thumbnail_s3_key,
		       v.created_at, v.updated_at
		FROM user_manga um
		JOIN volumes v ON um.manga_volume_id = v.id
		WHERE um.user_id = $1 AND um.manga_volume_id = $2 AND um.status = 'wishlisted'
	`, userID, volumeID).Scan(
		&v.ID, &v.MangaID, &v.Title, &v.Subtitle, &v.VolumeNumber, &v.ISBN13, &v.ISBN10, &v.PageCount,
		&v.Publisher, &v.PublishedDate, &v.Description, &v.Language, &v.Categories, &v.PriceAmount,
		&v.PriceCurrency, &v.Country, &v.PreviewLink, &v.InfoLink, &v.ThumbnailURL, &v.ThumbnailS3Key,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		c.JSON(404, gin.H{"error": "Not found"})
		return
	}
	c.JSON(200, v)
}

func deleteWishlistVolume(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	volumeID := c.Param("volume_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(`DELETE FROM user_manga WHERE user_id = $1 AND manga_volume_id = $2 AND status = 'wishlisted'`, userID, volumeID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to delete"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func getAllWishlist(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	rows, err := conn.Query(`
		SELECT v.id, v.manga_id, v.title, v.subtitle, v.volume_number, v.isbn_13, v.isbn_10, v.page_count,
		       v.publisher, v.published_date, v.description, v.language, v.categories, v.price_amount,
		       v.price_currency, v.country, v.preview_link, v.info_link, v.thumbnail_url, v.thumbnail_s3_key,
		       v.created_at, v.updated_at
		FROM user_manga um
		JOIN volumes v ON um.manga_volume_id = v.id
		WHERE um.user_id = $1 AND um.status = 'wishlisted'
	`, userID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to get wishlist"})
		return
	}
	defer rows.Close()

	var result []Volume
	for rows.Next() {
		var v Volume
		err := rows.Scan(
			&v.ID, &v.MangaID, &v.Title, &v.Subtitle, &v.VolumeNumber, &v.ISBN13, &v.ISBN10, &v.PageCount,
			&v.Publisher, &v.PublishedDate, &v.Description, &v.Language, &v.Categories, &v.PriceAmount,
			&v.PriceCurrency, &v.Country, &v.PreviewLink, &v.InfoLink, &v.ThumbnailURL, &v.ThumbnailS3Key,
			&v.CreatedAt, &v.UpdatedAt,
		)
		if err == nil {
			result = append(result, v)
		}
	}
	c.JSON(200, result)
}

func moveWishlistToCollection(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	volumeID := c.Param("volume_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(`UPDATE user_manga SET status = 'collected', added_at = NOW()
		WHERE user_id = $1 AND manga_volume_id = $2 AND status = 'wishlisted'`, userID, volumeID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to move to collection"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func moveAllMangaToWishlist(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	mangaID := c.Param("manga_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(`
		INSERT INTO user_manga (user_id, manga_volume_id, status, added_at)
		SELECT $1, v.id, 'wishlisted', NOW()
		FROM volumes v
		WHERE v.manga_id = $2
		ON CONFLICT (user_id, manga_volume_id) DO UPDATE SET status='wishlisted', added_at=NOW()
	`, userID, mangaID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to move all to wishlist"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func moveAllMangaToCollection(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}
	mangaID := c.Param("manga_id")

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(`
		INSERT INTO user_manga (user_id, manga_volume_id, status, added_at)
		SELECT $1, v.id, 'collected', NOW()
		FROM volumes v
		WHERE v.manga_id = $2
		ON CONFLICT (user_id, manga_volume_id) DO UPDATE SET status='collected', added_at=NOW()
	`, userID, mangaID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to move all to collection"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func getUniqueManga(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		c.JSON(500, gin.H{"error": "Failed to verify user!"})
		return
	}

	mangaType := c.Param("type")
	if mangaType != "wishlisted" && mangaType != "collected" && mangaType != "all" {
		c.JSON(400, gin.H{"error": "Invalid type"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	defer conn.Close()

	var rows *sql.Rows
	if mangaType == "all" {
		rows, err = conn.Query(`
			SELECT DISTINCT m.id, m.title_english
			FROM user_manga um
			JOIN volumes v ON um.manga_volume_id = v.id
			JOIN manga m ON m.id = v.manga_id
			WHERE um.user_id = $1
		`, userID)
	} else {
		rows, err = conn.Query(`
			SELECT DISTINCT m.id, m.title_english
			FROM user_manga um
			JOIN volumes v ON um.manga_volume_id = v.id
			JOIN manga m ON m.id = v.manga_id
			WHERE um.user_id = $1 and um.status = $2
		`, userID, mangaType)
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to get unique manga"})
		return
	}
	defer rows.Close()

	var mangaMap map[string]int = make(map[string]int)
	for rows.Next() {
		var mangaID int
		var mangaTitle string
		if err := rows.Scan(&mangaID, &mangaTitle); err == nil {
			mangaMap[mangaTitle] = mangaID
		}
	}
	c.JSON(200, gin.H{"manga": mangaMap})
}

func getVolumesByMangaAndType(c *gin.Context) {
	godotenv.Load()
	userID, ok := getUserIDFromCookie(c)
	if !ok {
		return
	}

	mangaID := c.Param("manga_id")
	colStatus := c.Param("type")

	// when looking for manga volumes that we DONT have in our collection
	if colStatus == "neither" {
		conn, err := get_db_conn()
		if err != nil {
			c.JSON(500, gin.H{"error": "DB error"})
			return
		}
		defer conn.Close()

		rows, err := conn.Query(`
			SELECT v.id as volume_id, v.title as volume_title, v.thumbnail_s3_key
			FROM volumes v
			JOIN manga m ON m.id = v.manga_id
			WHERE m.id = $1
				AND v.id NOT IN (
					SELECT um.manga_volume_id
					FROM user_manga um
					WHERE um.user_id = $2
						AND (um.status = 'collected' OR um.status = 'wishlisted')
				)
		`, mangaID, userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to get volumes"})
			return
		}
		defer rows.Close()

		type VolumeSummary struct {
			VolumeID       int            `json:"volume_id"`
			VolumeTitle    string         `json:"volume_title"`
			ThumbnailS3Key sql.NullString `json:"thumbnail_s3_key"`
		}

		var volumes []VolumeSummary
		for rows.Next() {
			var v VolumeSummary
			if err := rows.Scan(&v.VolumeID, &v.VolumeTitle, &v.ThumbnailS3Key); err == nil {
				volumes = append(volumes, v)
			}
		}
		c.JSON(200, volumes)
	} else {
		// Otherwise, of this manga, get the volumes we have wishlisted/collected
		conn, err := get_db_conn()
		if err != nil {
			c.JSON(500, gin.H{"error": "DB error"})
			return
		}
		defer conn.Close()

		rows, err := conn.Query(`
			SELECT v.id as volume_id, v.title as volume_title, v.thumbnail_s3_key
			FROM user_manga um
			JOIN volumes v ON v.id = um.manga_volume_id
			JOIN manga m ON m.id = v.manga_id
			WHERE um.status = $1
				AND um.user_id = $2
				AND m.id = $3
		`, colStatus, userID, mangaID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to get volumes"})
			return
		}
		defer rows.Close()

		type VolumeSummary struct {
			VolumeID       int            `json:"volume_id"`
			VolumeTitle    string         `json:"volume_title"`
			ThumbnailS3Key sql.NullString `json:"thumbnail_s3_key"`
		}

		var volumes []VolumeSummary
		for rows.Next() {
			var v VolumeSummary
			if err := rows.Scan(&v.VolumeID, &v.VolumeTitle, &v.ThumbnailS3Key); err == nil {
				volumes = append(volumes, v)
			}
		}
		c.JSON(200, volumes)
	}
}

func get_db_conn() (*sql.DB, error) {
	db := os.Getenv("DATABASE")
	host := os.Getenv("HOST")
	port := os.Getenv("PORT")
	user := os.Getenv("USER")
	password := os.Getenv("PASSWORD")
	connStr := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, db)

	conn, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	return conn, nil
}

func main() {
	router := gin.Default()

	// Change routes to not require user_id in path
	router.POST("/collection/:volume_id", addToCollection)
	router.GET("/collection/:volume_id", getCollectionVolume)
	router.DELETE("/collection/:volume_id", deleteCollectionVolume)
	router.GET("/collection", getAllCollection)

	router.POST("/wishlist/:volume_id", addToWishlist)
	router.GET("/wishlist/:volume_id", getWishlistVolume)
	router.DELETE("/wishlist/:volume_id", deleteWishlistVolume)
	router.GET("/wishlist", getAllWishlist)

	router.PUT("/wishlist/:volume_id/collection", moveWishlistToCollection)
	router.POST("/wishlist/manga/:manga_id", moveAllMangaToWishlist)
	router.POST("/collection/manga/:manga_id", moveAllMangaToCollection)

	router.GET("/collection_type/:type", getUniqueManga)
	router.GET("/collection_type/:type/:manga_id", getVolumesByMangaAndType)
	router.Run(":8080")
}
