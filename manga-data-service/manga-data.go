package main

import (
	//"fmt"

	"database/sql"
	"fmt"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	//"github.com/aws/aws-sdk-go/service/s3"
)

type Claims struct {
	UserID   int32  `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
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
	return int(claims.UserID), true
}

func get_mangas(c *gin.Context) {
	godotenv.Load()

	fmt.Printf("DEBUG get_mangas: Received path: %s\n", c.Request.URL.Path)

	conn, err := get_db_conn()

	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to connect to database"})
		return
	}
	defer conn.Close()

	rows, err := conn.QueryContext(c.Request.Context(), `SELECT id, 
			title_romaji, 
			title_english, 
			title_native, 
			description,
			start_date,
			end_date,
			status,
			total_volumes,
			total_chapters, cover_image_s3_key FROM manga
			ORDER BY POPULARITY DESC`)

	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to query database"})
		return
	}
	defer rows.Close()

	type Manga struct {
		ID              int            `json:"id"`
		TitleRomaji     sql.NullString `json:"title_romaji"`
		TitleEnglish    sql.NullString `json:"title_english"`
		TitleNative     sql.NullString `json:"title_native"`
		Description     sql.NullString `json:"description"`
		StartDate       sql.NullTime   `json:"start_date"`
		EndDate         sql.NullTime   `json:"end_date"`
		Status          sql.NullString `json:"status"`
		TotalVolumes    sql.NullInt16  `json:"total_volumes"`
		TotalChapters   sql.NullInt32  `json:"total_chapters"`
		CoverImageS3Key sql.NullString `json:"cover_image_s3_key"`
	}

	var mangas []Manga

	for rows.Next() {
		var m Manga
		err := rows.Scan(
			&m.ID,
			&m.TitleRomaji,
			&m.TitleEnglish,
			&m.TitleNative,
			&m.Description,
			&m.StartDate,
			&m.EndDate,
			&m.Status,
			&m.TotalVolumes,
			&m.TotalChapters,
			&m.CoverImageS3Key,
		)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to scan row"})
			return
		}

		mangas = append(mangas, m)
	}

	c.JSON(200, mangas)
}

func manga_by_id(c *gin.Context) {
	godotenv.Load()

	mangaId := c.Param("manga_id")

	conn, err := get_db_conn()

	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to connect to database"})
		return
	}
	defer conn.Close()

	row := conn.QueryRow(`SELECT id, 
			title_romaji, 
			title_english, 
			title_native, 
			description,
			start_date,
			end_date,
			status,
			total_volumes,
			total_chapters, cover_image_s3_key FROM manga
			WHERE id = $1`, mangaId)

	type Manga struct {
		ID              int            `json:"id"`
		TitleRomaji     sql.NullString `json:"title_romaji"`
		TitleEnglish    sql.NullString `json:"title_english"`
		TitleNative     sql.NullString `json:"title_native"`
		Description     sql.NullString `json:"description"`
		StartDate       sql.NullTime   `json:"start_date"`
		EndDate         sql.NullTime   `json:"end_date"`
		Status          sql.NullString `json:"status"`
		TotalVolumes    sql.NullInt16  `json:"total_volumes"`
		TotalChapters   sql.NullInt32  `json:"total_chapters"`
		CoverImageS3Key sql.NullString `json:"cover_image_s3_key"`
	}

	var manga Manga
	err = row.Scan(
		&manga.ID,
		&manga.TitleRomaji,
		&manga.TitleEnglish,
		&manga.TitleNative,
		&manga.Description,
		&manga.StartDate,
		&manga.EndDate,
		&manga.Status,
		&manga.TotalVolumes,
		&manga.TotalChapters,
		&manga.CoverImageS3Key,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to scan row"})
		return
	}

	c.JSON(200, manga)
}

func volume_for_manga(c *gin.Context) {
	mangaId := c.Param("manga_id")
	volumeId := c.Param("volume_id")

	// Check that query params are valid
	if len(mangaId) == 0 || len(volumeId) == 0 {
		if len(mangaId) == 0 {
			c.JSON(404, gin.H{"error": "Manga not found!"})
			return
		} else {
			c.JSON(404, gin.H{"error": "Manga volume not found!"})
			return
		}
	}

	conn, err := get_db_conn()

	if err != nil {
		c.JSON(500, gin.H{"error": "Server error"})
		return
	}
	// Define the struct to hold the result
	type Volume struct {
		MangaID        int             `json:"manga_id"`
		VolumeID       int             `json:"volume_id"`
		TitleRomaji    sql.NullString  `json:"title_romaji"`
		TitleEnglish   sql.NullString  `json:"title_english"`
		TitleNative    sql.NullString  `json:"title_native"`
		MangaDesc      sql.NullString  `json:"manga_description"`
		VolumeTitle    sql.NullString  `json:"volume_title"`
		VolumeSubtitle sql.NullString  `json:"volume_subtitle"`
		VolumeNumber   sql.NullInt16   `json:"volume_number"`
		ISBN13         sql.NullString  `json:"isbn_13"`
		ISBN10         sql.NullString  `json:"isbn_10"`
		PageCount      sql.NullInt16   `json:"page_count"`
		Publisher      sql.NullString  `json:"publisher"`
		PublishedDate  sql.NullTime    `json:"published_date"`
		VolumeDesc     sql.NullString  `json:"volume_description"`
		PriceAmount    sql.NullFloat64 `json:"price_amount"`
		PriceCurrency  sql.NullString  `json:"price_currency"`
		ThumbnailS3Key sql.NullString  `json:"thumbnail_s3_key"`
		UserColStatus  sql.NullString  `json:"user_col_status"`
	}

	var volume Volume

	row := conn.QueryRow(`SELECT v.manga_id, 
			v.id as volume_id,
			m.title_romaji, 
			m.title_english, 
			m.title_native, 
			m.description,
			v.title as volume_title,
			v.subtitle as volume_subtitle,
			v.volume_number,
			v.isbn_13,
			v.isbn_10,
			v.page_count,
			v.publisher,
			v.published_date,
			v.description,
			v.price_amount,
			v.price_currency,
			v.thumbnail_s3_key,
			COALESCE(um.status, NULL) AS user_col_status
			FROM volumes v
			JOIN manga m on m.id = v.manga_id
			LEFT JOIN user_manga um ON um.manga_volume_id = v.id
			WHERE v.manga_id = $1
			AND v.id = $2`, mangaId, volumeId)

	err = row.Scan(
		&volume.MangaID,
		&volume.VolumeID,
		&volume.TitleRomaji,
		&volume.TitleEnglish,
		&volume.TitleNative,
		&volume.MangaDesc,
		&volume.VolumeTitle,
		&volume.VolumeSubtitle,
		&volume.VolumeNumber,
		&volume.ISBN13,
		&volume.ISBN10,
		&volume.PageCount,
		&volume.Publisher,
		&volume.PublishedDate,
		&volume.VolumeDesc,
		&volume.PriceAmount,
		&volume.PriceCurrency,
		&volume.ThumbnailS3Key,
		&volume.UserColStatus,
	)

	if err != nil {
		fmt.Print(err)
		c.JSON(500, gin.H{"error": "Failed to scan row"})
		return
	}

	c.JSON(200, volume)
}

func get_volumes_for_manga(c *gin.Context) {
	mangaId := c.Param("manga_id")

	// Check that query params are valid
	if len(mangaId) == 0 {
		c.JSON(404, gin.H{"error": "Manga not found!"})
		return
	}

	conn, err := get_db_conn()

	if err != nil {
		c.JSON(500, gin.H{"error": "Server error"})
		return
	}
	// Define the struct to hold the result
	type Volume struct {
		MangaID        int             `json:"manga_id"`
		VolumeID       int             `json:"volume_id"`
		TitleRomaji    sql.NullString  `json:"title_romaji"`
		TitleEnglish   sql.NullString  `json:"title_english"`
		TitleNative    sql.NullString  `json:"title_native"`
		MangaDesc      sql.NullString  `json:"manga_description"`
		VolumeTitle    sql.NullString  `json:"volume_title"`
		VolumeSubtitle sql.NullString  `json:"volume_subtitle"`
		VolumeNumber   sql.NullInt16   `json:"volume_number"`
		ISBN13         sql.NullString  `json:"isbn_13"`
		ISBN10         sql.NullString  `json:"isbn_10"`
		PageCount      sql.NullInt16   `json:"page_count"`
		Publisher      sql.NullString  `json:"publisher"`
		PublishedDate  sql.NullTime    `json:"published_date"`
		VolumeDesc     sql.NullString  `json:"volume_description"`
		PriceAmount    sql.NullFloat64 `json:"price_amount"`
		PriceCurrency  sql.NullString  `json:"price_currency"`
		ThumbnailS3Key sql.NullString  `json:"thumbnail_s3_key"`
		UserColStatus  sql.NullString  `json:"user_col_status"`
	}

	var volumes []Volume

	rows, err := conn.Query(`
		SELECT v.manga_id, 
			v.id as volume_id,
			m.title_romaji, 
			m.title_english, 
			m.title_native, 
			m.description,
			v.title as volume_title,
			v.subtitle as volume_subtitle,
			v.volume_number,
			v.isbn_13,
			v.isbn_10,
			v.page_count,
			v.publisher,
			v.published_date,
			v.description,
			v.price_amount,
			v.price_currency,
			v.thumbnail_s3_key,
			COALESCE(um.status, NULL) as user_col_status
		FROM volumes v
		JOIN manga m on m.id = v.manga_id
		LEFT JOIN user_manga um ON um.manga_volume_id = v.id
		WHERE v.manga_id = $1
		ORDER BY v.volume_number
	`, mangaId)

	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to scan row!"})
		return
	}

	for rows.Next() {
		var volume Volume

		err = rows.Scan(
			&volume.MangaID,
			&volume.VolumeID,
			&volume.TitleRomaji,
			&volume.TitleEnglish,
			&volume.TitleNative,
			&volume.MangaDesc,
			&volume.VolumeTitle,
			&volume.VolumeSubtitle,
			&volume.VolumeNumber,
			&volume.ISBN13,
			&volume.ISBN10,
			&volume.PageCount,
			&volume.Publisher,
			&volume.PublishedDate,
			&volume.VolumeDesc,
			&volume.PriceAmount,
			&volume.PriceCurrency,
			&volume.ThumbnailS3Key,
			&volume.UserColStatus,
		)

		if err != nil {
			fmt.Println(err)
			c.JSON(500, gin.H{"error": "Failed to scan row!"})
			return
		}
		volumes = append(volumes, volume)
	}

	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to scan row"})
		return
	}

	c.JSON(200, volumes)
}

func search(c *gin.Context) {
	godotenv.Load()

	type SearchBody struct {
		SearchFrom string `json:"searchFrom"` // collection, wishlist, general
		By         string `json:"by"`         // manga, volume
	}

	query := c.Query("query")

	var searchBody SearchBody

	err := c.BindJSON(&searchBody)

	if err != nil {
		c.JSON(400, gin.H{"success": false, "error": "Invalid request!"})
		return
	}

	var userID int
	if searchBody.SearchFrom != "general" {
		userIDtemp, ok := getUserIDFromCookie(c)
		if ok == false {
			c.JSON(400, gin.H{"success": false, "error": "Invalid request!"})
			return
		}
		userID = userIDtemp
	}

	conn, err := get_db_conn()

	if err != nil {
		c.JSON(500, gin.H{"error": "Server error"})
		return
	}

	var rows *sql.Rows
	if searchBody.By == "manga" {
		var general = true
		if searchBody.SearchFrom == "collected" || searchBody.SearchFrom == "wishlisted" {
			general = false
		} else if searchBody.SearchFrom != "general" {
			c.JSON(400, gin.H{"error": "Invalid request!"})
			return
		}
		if general == true {
			rows, err = conn.Query(`SELECT id, title_english FROM manga
			WHERE similarity(title_english, $1) > 0.1
			ORDER BY similarity(title_english, $1) DESC`, query)
			if err != nil {
				fmt.Println(err)
				c.JSON(500, gin.H{"error": "Failed to query"})
				return
			}
		} else {
			rows, err = conn.Query(`SELECT DISTINCT m.id, m.title_english FROM manga m
			JOIN volumes v on v.manga_id = m.id
			JOIN user_manga um ON um.manga_volume_id = v.id
			WHERE um.user_id = $1
			AND um.status = $2
			AND similarity(m.title_english, $3) > 0.1
			ORDER BY similarity(m.title_english, $3) DESC`, userID, searchBody.SearchFrom, query)

			if err != nil {
				fmt.Println(err)
				c.JSON(500, gin.H{"error": "Failed to query"})
				return
			}
		}
	} else if searchBody.By == "volume" {
		var general = true
		if searchBody.SearchFrom == "collected" || searchBody.SearchFrom == "wishlisted" {
			general = false
		} else if searchBody.SearchFrom != "general" {
			c.JSON(400, gin.H{"error": "Invalid request!"})
			return
		}
		if general == true {
			rows, err = conn.Query(`SELECT id, title FROM volumes
			WHERE similarity(title, $1) > 0.1
			ORDER BY similarity(title, $1) DESC`, query)

			if err != nil {
				fmt.Println(err)
				c.JSON(500, gin.H{"error": "Failed to query"})
				return
			}
		} else {
			rows, err = conn.Query(`SELECT DISTINCT v.id, v.title FROM volumes v
			JOIN user_manga um ON um.manga_volume_id = v.id
			WHERE um.user_id = $1
			AND um.status = $2
			AND similarity(v.title, $3) > 0.1
			ORDER BY similarity(v.title, $3) DESC`, userID, searchBody.SearchFrom, query)

			if err != nil {
				fmt.Println(err)
				c.JSON(500, gin.H{"error": "Failed to query"})
				return
			}
		}
	} else {
		c.JSON(400, gin.H{"error": "Invalid parameters!"})
		return
	}

	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id int
		var text string
		err = rows.Scan(&id, &text)
		if err != nil {
			c.JSON(500, gin.H{"error": "Scan failed"})
			return
		}
		results = append(results, map[string]interface{}{"id": id, "text": text})
	}

	c.JSON(200, gin.H{"results": results, "by": searchBody.By, "searchFrom": searchBody.SearchFrom})
}

func main() {
	router := gin.Default()

	// Disable automatic redirect for trailing slashes
	router.RedirectTrailingSlash = false
	router.RedirectFixedPath = false

	// Manga routes
	router.GET("/:manga_id", manga_by_id)
	router.GET("/", get_mangas)

	// Volume routes
	router.GET("/:manga_id/volumes/:volume_id", volume_for_manga)
	router.GET("/:manga_id/volumes", get_volumes_for_manga)

	// Search route
	router.POST("/search", search)

	router.Run(":8080") //8081 for testing, 8080 for prod
}
