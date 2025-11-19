package main

import (
	//"fmt"

	"database/sql"
	"fmt"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	//"github.com/aws/aws-sdk-go/service/s3"
)

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

func get_mangas(c *gin.Context) {
	godotenv.Load()

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
			v.thumbnail_s3_key
			FROM volumes v
			JOIN manga m on m.id = v.manga_id
			WHERE v.manga_id = $1
			AND v.id = $2
			ORDER BY v.volume_number`, mangaId, volumeId)

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
	)

	if err != nil {
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
	}

	var volumes []Volume

	rows, err := conn.Query(`SELECT v.manga_id, 
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
			v.thumbnail_s3_key
			FROM volumes v
			JOIN manga m on m.id = v.manga_id
			WHERE v.manga_id = $1
			ORDER BY v.volume_number`, mangaId)

	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to can row!"})
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

func main() {
	router := gin.Default()

	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// Manga routes
	router.GET("/mangas/:manga_id", manga_by_id)
	router.GET("/mangas", get_mangas)

	// Volume routes
	router.GET("/mangas/:manga_id/volumes/:volume_id", volume_for_manga)
	router.GET("/mangas/:manga_id/volumes", get_volumes_for_manga)
	router.Run(":8080")
}
