package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"

	"image"
	"image/jpeg"
	"image/png"

	"github.com/dutchcoders/go-clamd"
)

type SubmissionRequest struct {
	UserID          int    `json:"user_id"`
	MangaID         int    `json:"manga_id"`
	VolumeTitle     string `json:"volume_title"`
	VolumeNumber    int    `json:"volume_number"`
	SubmissionNotes string `json:"submission_notes"`
}

type UserSubmissionFetch struct {
	TitleEnglish    string `json:"title_english"`
	MangaID         int    `json:"manga_id"`
	VolumeTitle     string `json:"volume_title"`
	VolumeNumber    int    `json:"volume_number"`
	SubmissionNotes string `json:"submission_notes"`
	CoverImageURL   string `json:"cover_image_url"`
	ApprovalStatus  string `json:"approval_status"`
}

// verifyImage scans a multipart image for viruses using ClamAV.
// It takes an io.Reader (from multipart.File) and returns (bool, error).
func verifyImage(file io.Reader) (bool, error) {
	clamdClient := clamd.NewClamd("tcp://127.0.0.1:3310") // Change to your ClamAV socket if needed

	// Read the file into a buffer for streaming
	buf := new(bytes.Buffer)
	_, err := io.Copy(buf, file)
	if err != nil {
		return false, err
	}

	// Scan the buffer
	response, err := clamdClient.ScanStream(bytes.NewReader(buf.Bytes()), make(chan bool))
	if err != nil {
		return false, err
	}

	for result := range response {
		if result.Status == clamd.RES_FOUND {
			return false, fmt.Errorf("virus found: %s", result.Description)
		}
	}

	return true, nil
}

func SanitizeImageReader(r io.Reader, w io.Writer) error {
	img, format, err := image.Decode(r)
	if err != nil {
		return fmt.Errorf("decode error: %w", err)
	}

	switch strings.ToLower(format) {
	case "png":
		return png.Encode(w, img)
	case "jpeg", "jpg":
		return jpeg.Encode(w, img, &jpeg.Options{Quality: 90})
	default:
		return fmt.Errorf("unsupported image format: %s", format)
	}
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

type UserSubmission struct {
	TitleEnglish    string `json:"title_english"`
	MangaID         int    `json:"manga_id"`
	VolumeTitle     string `json:"volume_title"`
	VolumeNumber    int    `json:"volume_number"`
	SubmissionNotes string `json:"submission_notes"`
	CoverImageURL   string `json:"cover_image_url"`
	ApprovalStatus  string `json:"approval_status"`
}

type SubmissionBody struct {
	SubmissionNotes string `json:"submission_notes"`
}

// Helper to validate user_id from cookie JWT matches route param
func validateUserID(c *gin.Context) (int, bool) {
	godotenv.Load()
	tokenString, err := c.Cookie("access_token")
	if err != nil {
		fmt.Println("this is the issue")
		c.JSON(401, gin.H{"error": "No token"})
		return 0, false
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		return []byte(os.Getenv("SECRET_KEY")), nil
	})
	if err != nil || !token.Valid {
		fmt.Println("right here")
		c.JSON(401, gin.H{"error": "Invalid token"})
		return 0, false
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		fmt.Println("over here")
		c.JSON(401, gin.H{"error": "Invalid token claims"})
		return 0, false
	}

	// Print out the claims for debugging
	fmt.Printf("Token claims: %+v\n", claims)

	routeUserID := c.Param("user_id")
	var routeID int
	fmt.Sscanf(routeUserID, "%d", &routeID)
	if claims.UserID != routeID {
		c.JSON(403, gin.H{"error": "User ID mismatch"})
		return 0, false
	}
	return claims.UserID, true
}

func getUserID(c *gin.Context) (int, bool) {
	godotenv.Load()
	tokenString, err := c.Cookie("access_token")
	if err != nil {
		fmt.Println("this is the issue")
		c.JSON(401, gin.H{"error": "No token"})
		return 0, false
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		return []byte(os.Getenv("SECRET_KEY")), nil
	})
	if err != nil || !token.Valid {
		fmt.Println("right here")
		c.JSON(401, gin.H{"error": "Invalid token"})
		return 0, false
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		fmt.Println("over here")
		c.JSON(401, gin.H{"error": "Invalid token claims"})
		return 0, false
	}

	// Print out the claims for debugging
	fmt.Printf("Token claims: %+v\n", claims)

	return claims.UserID, true
}

func verifyUserIsAdmin(user_id int, conn *sql.DB) (bool, string) {
	var isAdmin bool
	err := conn.QueryRow(`SELECT exists (
				SELECT 1 FROM users WHERE
				user_type = 'admin'
				AND id = $1
				)`, user_id).Scan(&isAdmin)
	if err != nil {
		return false, "Failed to check admin status"
	}
	if !isAdmin {
		return false, "User is not an admin"
	}
	return true, ""
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

func createSubmission(c *gin.Context) {
	godotenv.Load()
	// Validate user first
	userID, valid := getUserID(c)
	if !valid {
		fmt.Println("not valid")
		c.JSON(400, gin.H{"error": "Unable to verify user request"})
		return
	}

	err := c.Request.ParseMultipartForm(10 << 20) // 10 MB max memory
	if err != nil {
		c.JSON(400, gin.H{"error": "Could not parse multipart form"})
		return
	}

	mangaID, _ := strconv.Atoi(c.Request.FormValue("manga_id"))
	volumeTitle := c.Request.FormValue("volume_title")
	volumeNumber, _ := strconv.Atoi(c.Request.FormValue("volume_number"))
	submissionNotes := c.Request.FormValue("submission_notes")

	// Extract the image file
	file, _, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(400, gin.H{"error": "Error retrieving the file"})
		return
	}
	defer file.Close()

	// Read file into buffer for multiple uses
	buf := new(bytes.Buffer)
	_, err = io.Copy(buf, file)
	if err != nil {
		c.JSON(400, gin.H{"error": "Failed to read image"})
		return
	}

	// Virus scan
	isSafe, err := verifyImage(bytes.NewReader(buf.Bytes()))
	if err != nil || !isSafe {
		c.JSON(400, gin.H{"error": "Image failed security checks"})
		return
	}

	// Sanitize image
	sanitizedBuf := new(bytes.Buffer)
	if err := SanitizeImageReader(bytes.NewReader(buf.Bytes()), sanitizedBuf); err != nil {
		c.JSON(400, gin.H{"error": "Failed to sanitize image"})
		return
	}

	// S3 upload
	awsRegion := os.Getenv("AWS_REGION")
	awsBucket := os.Getenv("AWS_BUCKET_NAME")
	if awsRegion == "" || awsBucket == "" {
		fmt.Print("here")
		c.JSON(500, gin.H{"error": "AWS environment variables not set"})
		return
	}

	folderName := fmt.Sprintf("%x", sha256.Sum256([]byte(volumeTitle)))
	fileName := fmt.Sprintf("%d", time.Now().Unix())
	imagePath := fmt.Sprintf("manga/submissions/%s/%s.jpg", folderName, fileName)

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(awsRegion))
	if err != nil {
		fmt.Println("config is the issue")
		c.JSON(500, gin.H{"error": "Failed to load AWS config"})
		return
	}
	s3Client := s3.NewFromConfig(cfg)

	input := &s3.PutObjectInput{
		Bucket:      aws.String(awsBucket),
		Key:         aws.String(imagePath),
		Body:        sanitizedBuf,
		ContentType: aws.String("image/jpeg"),
	}
	_, err = s3Client.PutObject(context.TODO(), input)
	if err != nil {
		fmt.Println("Failed to upload image to S3")
		c.JSON(500, gin.H{"error": "Failed to upload image to S3"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		fmt.Println("db conn error")
		c.JSON(500, gin.H{"error": "Database connection error"})
		return
	}
	defer conn.Close()

	_, err = conn.Exec(
		`INSERT INTO manga_volume_submissions (submitter_user_id, manga_id, volume_title, volume_number, submission_notes, cover_image_url)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		userID, mangaID, volumeTitle, volumeNumber, submissionNotes, imagePath)
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to save submission"})
		return
	}

	c.JSON(200, gin.H{"message": "Submission created successfully"})
}

func getSubmissionsFromUser(c *gin.Context) {
	_, valid := validateUserID(c)
	if !valid {
		c.JSON(401, gin.H{"error": "Invalid cookie"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Database connection error"})
		return
	}
	defer conn.Close()

	//(user_id, manga_id, volume_title, volume_number, submission_notes)
	rows, err := conn.Query(`
		SELECT m.title_english, us.manga_id, us.volume_title, us.volume_number, us.submission_notes, us.cover_image_url, us.status
		FROM manga_volume_submissions us
		JOIN manga m ON us.manga_id = m.id
		WHERE us.submitter_user_id = $1
	`, c.Param("user_id"))
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to fetch submissions"})
		return
	}
	defer rows.Close()

	var submissions []UserSubmissionFetch
	for rows.Next() {
		var s UserSubmissionFetch
		err := rows.Scan(&s.TitleEnglish, &s.MangaID, &s.VolumeTitle, &s.VolumeNumber, &s.SubmissionNotes, &s.CoverImageURL, &s.ApprovalStatus)
		if err != nil {
			fmt.Println(err)
			c.JSON(500, gin.H{"error": "Error scanning submission"})
			return
		}
		submissions = append(submissions, s)
	}

	c.JSON(200, gin.H{"submissions": submissions})

}

type SubmissionFilters struct {
	Status string `json:"status"`
}

func getSubmission(c *gin.Context) {
	godotenv.Load()
	id := c.Param("id")
	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Database connection error"})
		return
	}
	defer conn.Close()

	var s UserSubmission
	err = conn.QueryRow(`
		SELECT m.title_english, us.manga_id, us.volume_title, us.volume_number, us.submission_notes, us.cover_image_url, us.status
		FROM manga_volume_submissions us
		JOIN manga m ON us.manga_id = m.id
		WHERE us.id = $1
	`, id).Scan(&s.TitleEnglish, &s.MangaID, &s.VolumeTitle, &s.VolumeNumber, &s.SubmissionNotes, &s.CoverImageURL, &s.ApprovalStatus)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Submission not found"})
		return
	} else if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to fetch submission"})
		return
	}

	c.JSON(200, s)
}

// filters right now (more to come!):
// - status
func getSubmissions(c *gin.Context) {
	user_id, valid := getUserID(c)
	if !valid {
		c.JSON(401, gin.H{"error": "Invalid cookie"})
		return
	}

	var submissionFilters SubmissionFilters

	err := c.BindJSON(&submissionFilters)
	if err != nil {
		c.JSON(404, gin.H{"error": "Invalid filters"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Database connection error"})
		return
	}
	defer conn.Close()

	// Check user's an admin
	isAdmin, adminErrMsg := verifyUserIsAdmin(user_id, conn)
	if !isAdmin {
		c.JSON(403, gin.H{"error": adminErrMsg})
		return
	}

	//(user_id, manga_id, volume_title, volume_number, submission_notes)
	rows, err := conn.Query(`
		SELECT m.title_english, us.manga_id, us.volume_title, us.volume_number, us.submission_notes, us.cover_image_url, us.status
		FROM manga_volume_submissions us
		JOIN manga m ON us.manga_id = m.id
		WHERE us.status = $1
	`, submissionFilters.Status)
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to fetch submissions"})
		return
	}
	defer rows.Close()

	var submissions []UserSubmissionFetch
	for rows.Next() {
		var s UserSubmissionFetch
		err := rows.Scan(&s.TitleEnglish, &s.MangaID, &s.VolumeTitle, &s.VolumeNumber, &s.SubmissionNotes, &s.CoverImageURL, &s.ApprovalStatus)
		if err != nil {
			fmt.Println(err)
			c.JSON(500, gin.H{"error": "Error scanning submission"})
			return
		}
		submissions = append(submissions, s)
	}

	c.JSON(200, gin.H{"submissions": submissions})
}

func acceptSubmission(c *gin.Context) {
	var submissionBody SubmissionBody
	err := c.BindJSON(&submissionBody)
	if err != nil && err.Error() != "EOF" {
		c.JSON(500, gin.H{"error": "Failed to accept submission request"})
		return
	}

	user_id, valid := getUserID(c)
	if !valid {
		c.JSON(400, gin.H{"error": "Unable to verify user request"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to access database"})
		return
	}

	isAdmin, adminErrMsg := verifyUserIsAdmin(user_id, conn)
	if !isAdmin {
		c.JSON(403, gin.H{"error": adminErrMsg})
		return
	}

	submission_id := c.Param("submission_id")

	var mangaID int
	var volumeTitle string
	var volumeNumber int
	var coverImageURL string

	err = conn.QueryRow(`SELECT manga_id, volume_title, volume_number, cover_image_url 
				FROM manga_volume_submissions WHERE id = $1`, submission_id).Scan(&mangaID, &volumeTitle, &volumeNumber, &coverImageURL)
	if err != nil {
		c.JSON(404, gin.H{"error": "Failed to fetch submission data"})
		return
	}

	tx, err := conn.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to begin transaction"})
		return
	}
	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	_, err = tx.Exec(
		`INSERT INTO volumes (manga_id, title, volume_number, thumbnail_s3_key)
		 VALUES ($1, $2, $3, $4)`,
		mangaID, volumeTitle, volumeNumber, coverImageURL,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to add volume"})
		return
	}

	var updateQuery string
	var args []any

	if strings.TrimSpace(submissionBody.SubmissionNotes) != "" {
		updateQuery = `
			UPDATE manga_volume_submissions
			SET status = 'accepted',
				reviewed_at = NOW(),
				reviewed_by = $2,
				updated_at = NOW(),
				submission_notes = $3
			WHERE id = $1`
		args = []any{submission_id, user_id, submissionBody.SubmissionNotes}
	} else {
		updateQuery = `
			UPDATE manga_volume_submissions
			SET status = 'accepted',
				reviewed_at = NOW(),
				reviewed_by = $2,
				updated_at = NOW(),
				submission_notes = NULL
			WHERE id = $1`
		args = []any{submission_id, user_id}
	}

	_, err = tx.Exec(updateQuery, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to update submission status"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}
	rollback = false

	c.JSON(200, gin.H{"message": "Submission accepted and volume added"})
}

func rejectSubmission(c *gin.Context) {
	var submissionBody SubmissionBody
	err := c.BindJSON(&submissionBody)
	if err != nil && err.Error() != "EOF" {
		c.JSON(500, gin.H{"error": "Failed to reject submission request"})
		return
	}

	user_id, valid := getUserID(c)
	if !valid {
		c.JSON(400, gin.H{"error": "Unable to verify user request"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to access database"})
		return
	}

	isAdmin, adminErrMsg := verifyUserIsAdmin(user_id, conn)
	if !isAdmin {
		c.JSON(403, gin.H{"error": adminErrMsg})
		return
	}

	submission_id := c.Param("submission_id")

	tx, err := conn.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to begin transaction"})
		return
	}
	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	var updateQuery string
	var args []any

	if strings.TrimSpace(submissionBody.SubmissionNotes) != "" {
		updateQuery = `
			UPDATE manga_volume_submissions
			SET status = 'rejected',
				reviewed_at = NOW(),
				reviewed_by = $2,
				updated_at = NOW(),
				submission_notes = $3
			WHERE id = $1`
		args = []any{submission_id, user_id, submissionBody.SubmissionNotes}
	} else {
		updateQuery = `
			UPDATE manga_volume_submissions
			SET status = 'rejected',
				reviewed_at = NOW(),
				reviewed_by = $2,
				updated_at = NOW(),
				submission_notes = NULL
			WHERE id = $1`
		args = []any{submission_id, user_id}
	}

	_, err = tx.Exec(updateQuery, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to execute transaction"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}
	rollback = false

	c.JSON(200, gin.H{"message": "Submission rejected successfully"})
}

// For now, the only thing that should be editable is:
// - manga_id
// - volume_title
// - volume_number
// - status

// if approval status moves from accepted to anything else, the volume should be deleted in volumes
// user shouldn't be able to move a submission to accepted from here, anything else can be done
func editSubmission(c *gin.Context) {
	user_id, valid := getUserID(c)
	if !valid {
		c.JSON(400, gin.H{"error": "Unable to verify user request"})
		return
	}

	var adminEditSubmission map[string]interface{}
	err := c.BindJSON(&adminEditSubmission)
	if err != nil {
		c.JSON(404, gin.H{"error": "Failed to access edit submission"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to access database"})
		return
	}

	isAdmin, adminErrMsg := verifyUserIsAdmin(user_id, conn)
	if !isAdmin {
		c.JSON(403, gin.H{"error": adminErrMsg})
		return
	}

	tx, err := conn.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to begin transaction"})
		return
	}
	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	// Filtered valid keys and values
	allowedFields := []string{"manga_id", "volume_title", "volume_number", "status"}
	validEdits := make(map[string]interface{})
	for key, value := range adminEditSubmission {
		for _, field := range allowedFields {
			if key == field && value != "" {
				validEdits[key] = value
				break
			}
		}
	}

	if validEdits["status"] == "accepted" {
		c.JSON(400, gin.H{"error": "Not allowed to move submission to accepted through edits!"})
		return
	}

	if len(validEdits) == 0 {
		c.JSON(400, gin.H{"error": "No valid fields to update"})
		return
	}

	// If status changed from accepted to something else, delete volume
	submission_id := c.Param("submission_id")
	if validEdits["status"] != nil {
		var prevStatus string
		err = conn.QueryRow(`SELECT status FROM manga_volume_submissions WHERE id = $1`, submission_id).Scan(&prevStatus)
		if err == nil && prevStatus == "accepted" && validEdits["status"] != "accepted" {
			_, err = tx.Exec(`DELETE FROM volumes WHERE manga_id = (SELECT manga_id FROM manga_volume_submissions WHERE id = $1) AND volume_number = (SELECT volume_number FROM manga_volume_submissions WHERE id = $1)`, submission_id)
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to delete volume after status change"})
				return
			}
		}
	}

	// Build dynamic update query (for dynamic edit requests)
	setClauses := []string{}
	args := []any{}
	argIdx := 1
	for key, value := range validEdits {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", key, argIdx))
		args = append(args, value)
		argIdx++
	}
	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, submission_id)

	updateQuery := fmt.Sprintf(
		`UPDATE manga_volume_submissions SET %s WHERE id = $%d`,
		strings.Join(setClauses, ", "),
		argIdx,
	)

	_, err = tx.Exec(updateQuery, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to update submission"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}
	rollback = false

	c.JSON(200, gin.H{"message": "Submission updated successfully"})
}

func main() {
	router := gin.Default()

	// User routes
	router.POST("/submissions", createSubmission)                     // body passes in user_id
	router.GET("/submissions/users/:user_id", getSubmissionsFromUser) // gets all submissions from a user
	router.GET("/submissions/:id", getSubmission)                     // get a specific submission info

	router.GET("/admin/submissions", getSubmissions)                          // List all submissions, takes body with filters, no filters for now
	router.POST("/admin/submissions/:submission_id/accept", acceptSubmission) // approve submission, add to volumes
	router.POST("/admin/submissions/:submission_id/reject", rejectSubmission) // reject submission
	router.PATCH("/admin/submissions/:submission_id", editSubmission)         // change submission before approving

	router.Run(":8080")
}
