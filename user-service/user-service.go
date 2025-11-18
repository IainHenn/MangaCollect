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
	Subtitle       string          `json:"subtitle"`
	VolumeNumber   int             `json:"volume_number"`
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

// Helper to validate user_id from cookie JWT matches route param
func validateUserID(c *gin.Context) (int, bool) {
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

	routeUserID := c.Param("user_id")
	var routeID int
	fmt.Sscanf(routeUserID, "%d", &routeID)
	if claims.UserID != routeID {
		c.JSON(403, gin.H{"error": "User ID mismatch"})
		return 0, false
	}
	return claims.UserID, true
}

func addToCollection(c *gin.Context) {
	godotenv.Load()
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")

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

func addToWishlist(c *gin.Context) {
	godotenv.Load()
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")

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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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
	_, ok := validateUserID(c)
	if !ok {
		return
	}
	userID := c.Param("user_id")
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

	// Collection endpoints
	router.POST("/users/:user_id/collection/:volume_id", addToCollection)          // tested
	router.GET("/users/:user_id/collection/:volume_id", getCollectionVolume)       // tested
	router.DELETE("/users/:user_id/collection/:volume_id", deleteCollectionVolume) // tested
	router.GET("/users/:user_id/collection", getAllCollection)                     // tested

	// Wishlist endpoints
	router.POST("/users/:user_id/wishlist/:volume_id", addToWishlist)          // tested
	router.GET("/users/:user_id/wishlist/:volume_id", getWishlistVolume)       // tested
	router.DELETE("/users/:user_id/wishlist/:volume_id", deleteWishlistVolume) // tested
	router.GET("/users/:user_id/wishlist", getAllWishlist)                     // tested

	// Moving wishlist item to collection
	router.PUT("/users/:user_id/wishlist/:volume_id/collection", moveWishlistToCollection) // tested

	// Move all volumes for a manga to wishlist
	router.POST("/users/:user_id/wishlist/manga/:manga_id", moveAllMangaToWishlist) // tested

	// Move all volumes for a manga to collection
	router.POST("/users/:user_id/collection/manga/:manga_id", moveAllMangaToCollection) // tested

	router.Run()
}
