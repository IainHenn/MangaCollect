package main

import (
	//"fmt"

	"database/sql"
	"fmt"
	"net/smtp"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	//"github.com/aws/aws-sdk-go/service/s3"
)

type User struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type Claims struct {
	UserID   int32  `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

type VerificationRequest struct {
	Email string `json:"email"`
	Token string `json:"token"`
}

type VerificationResend struct {
	Email string `json:"email"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type PasswordResetRequest struct {
	Email string `json:"email"`
}

type PasswordReset struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// Hash the password
func hashPassword(u User) (User, error) {
	passwordBytes := []byte(u.Password)
	if len(passwordBytes) > 72 {
		passwordBytes = passwordBytes[:72]
	}

	hashedPassword, err := bcrypt.GenerateFromPassword(passwordBytes, bcrypt.DefaultCost)
	if err != nil {
		return u, err
	} else {
		u.Password = string(hashedPassword)
		return u, nil
	}
}

func checkJWT(email string) string {
	conn, err := get_db_conn()
	if err != nil {
		fmt.Println("Failed to connect to database:", err)
		return ""
	}
	defer conn.Close()

	var token string
	query := `
		SELECT jt.token_hash
		FROM jwt_tokens jt
		JOIN users u ON jt.user_id = u.id
		WHERE u.email = $1 AND jt.token_type = 'verify_email' AND jt.expires_at > NOW()
		ORDER BY jt.expires_at DESC
		LIMIT 1
	`
	err = conn.QueryRow(query, email).Scan(&token)
	if err != nil {
		return ""
	}
	return token
}

// Generate JWT
func generateJWT(user_id int32, username string, email string) (string, time.Time, time.Time, error) {
	var jwtKey = []byte(os.Getenv("SECRET_KEY"))
	issuedAt := time.Now()
	expiresAt := issuedAt.Add(15 * time.Minute)

	claims := Claims{
		UserID:   user_id,
		Username: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(issuedAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		return "", time.Time{}, time.Time{}, err
	}
	return tokenString, expiresAt, issuedAt, nil
}

// Make sure username and email are unique
func checkUniqueUser(username string, email string, conn *sql.DB) bool {
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE username=$1 OR email=$2)`
	err := conn.QueryRow(query, username, email).Scan(&exists)
	if err != nil {
		return false
	}
	return !exists
}

// Create a db connection
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

// Email user --> needs a frontend URL configured in env file
func emailUser(email string, token string) bool {
	// Load SMTP config from env
	smtpHost := os.Getenv("SMTP")
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("EMAIL")
	smtpPass := os.Getenv("APP_PASSWORD")
	from := os.Getenv("EMAIL")

	verificationLink := fmt.Sprintf("%s/verify-email?token=%s&email=%s", os.Getenv("FRONTEND_URL"), token, email)
	subject := "Verify your email address"
	body := fmt.Sprintf("Please verify your email by clicking the following link: %s", verificationLink)

	msg := "From: " + from + "\r\n" +
		"To: " + email + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=\"utf-8\"\r\n" +
		"\r\n" +
		body

	addr := smtpHost + ":" + smtpPort
	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)

	err := smtp.SendMail(addr, auth, from, []string{email}, []byte(msg))
	if err != nil {
		fmt.Println("Failed to send email:", err)
		fmt.Println("Check your SMTP configuration and credentials.")
		return false
	}
	return true
}

// Send password reset email
func emailPasswordReset(email string, token string) bool {
	smtpHost := os.Getenv("SMTP")
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("EMAIL")
	smtpPass := os.Getenv("APP_PASSWORD")
	from := os.Getenv("EMAIL")

	resetLink := fmt.Sprintf("%s/reset-password?token=%s&email=%s", os.Getenv("FRONTEND_URL"), token, email)
	subject := "Password Reset Request"
	body := fmt.Sprintf("You requested a password reset. Click the following link to reset your password: %s\n\nIf you did not request this, please ignore this email.", resetLink)

	msg := "From: " + from + "\r\n" +
		"To: " + email + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=\"utf-8\"\r\n" +
		"\r\n" +
		body

	addr := smtpHost + ":" + smtpPort
	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)

	err := smtp.SendMail(addr, auth, from, []string{email}, []byte(msg))
	if err != nil {
		fmt.Println("Failed to send password reset email:", err)
		fmt.Println("Check your SMTP configuration and credentials.")
		return false
	}
	return true
}

// Checks email resend limit for a user, so they can't spam
func checkEmailResendLim(email string, conn *sql.DB) bool {
	var count int
	query := `
		SELECT COUNT(*) FROM user_attempts ua
		JOIN users u ON u.id = ua.user_id
		WHERE u.email = $1 AND ua.attempted_at >= NOW() - INTERVAL '1 hours'
	`
	err := conn.QueryRow(query, email).Scan(&count)
	if err != nil {
		fmt.Println("Error checking resend limit:", err)
		return false
	}
	return count < 5
}

// Checks attempt limit for a user and action
func checkAttemptLimit(email string, conn *sql.DB, action string, max int) bool {
	var count int
	query := `
		SELECT COUNT(*) FROM user_attempts ua
		JOIN users u ON u.id = ua.user_id
		WHERE u.email = $1 AND ua.action = $2 AND ua.attempted_at >= NOW() - INTERVAL '1 hours'
	`
	err := conn.QueryRow(query, email, action).Scan(&count)
	if err != nil {
		fmt.Println("Error checking attempt limit:", err)
		return false
	}
	return count < max
}

// Create user
func createUser(c *gin.Context) {
	// Assume that email, password, and username are validated on the frontend...
	var user User

	err := c.BindJSON(&user)
	if err != nil {
		c.JSON(400, gin.H{"error": "Failed to signup, bad credentials!"})
		return
	}

	err = godotenv.Load()

	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to connect to database!"})
		return
	}

	user, err = hashPassword(user)
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to create user!"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to connect to database"})
		return
	}

	// Ensure the connection is alive
	if err = conn.Ping(); err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Database connection is not alive"})
		return
	}

	tx, err := conn.Begin()
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to start transaction"})
		return
	}

	unique := checkUniqueUser(user.Username, user.Email, conn)
	if !unique {
		tx.Rollback()
		c.JSON(400, gin.H{"error": "Username or email already exists!"})
		return
	}

	var user_id int32
	err = tx.QueryRow(
		`INSERT INTO users (username, email, password_hash, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING id`,
		user.Username, user.Email, user.Password,
	).Scan(&user_id)
	if err != nil {
		tx.Rollback()
		c.JSON(500, gin.H{"error": "Failed to create user!"})
		return
	}

	tokenString, expiresAt, issuedAt, err := generateJWT(user_id, user.Username, user.Email)
	if err != nil {
		tx.Rollback()
		c.JSON(500, gin.H{"error": "Failed to generate token"})
		return
	}

	_, err = tx.Exec(`INSERT INTO jwt_tokens (user_id, token_hash, expires_at, created_at, token_type)
						VALUES ($1, $2, $3, $4, 'verify_email')`,
		user_id, tokenString, expiresAt, issuedAt)

	if err != nil {
		tx.Rollback()
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to save token"})
		return
	}

	emailed := emailUser(user.Email, tokenString)
	if !emailed {
		tx.Rollback()
		c.JSON(500, gin.H{"error": "Failed to send verification email"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}

	defer conn.Close()

	c.JSON(201, gin.H{
		"user_id":  user_id,
		"username": user.Username,
		"email":    user.Email,
		"token":    tokenString,
	})
}

// Verify email
func verifyEmail(c *gin.Context) {
	godotenv.Load()

	var verificationRequest VerificationRequest

	err := c.BindJSON(&verificationRequest)
	if err != nil {
		c.JSON(404, gin.H{"error": "Failed to process verification request"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to connect to database"})
		return
	}
	defer conn.Close()

	var exists bool
	err = conn.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM jwt_tokens jt
			JOIN users u ON jt.user_id = u.id
			WHERE u.email = $1 AND jt.token_hash = $2
		)`, verificationRequest.Email, verificationRequest.Token,
	).Scan(&exists)

	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to verify user"})
		return
	} else if !exists {
		c.JSON(400, gin.H{"error": "Invalid email or token"})
		return
	}

	// Start a transaction for updating email verification status
	tx, err := conn.Begin()
	if err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to start transaction"})
		return
	}

	_, err = tx.Exec(
		`UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE email = $1`,
		verificationRequest.Email,
	)
	if err != nil {
		tx.Rollback()
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to update email verification status"})
		return
	}

	if err := tx.Commit(); err != nil {
		fmt.Println(err)
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(200, gin.H{"message": "Email verified successfully"})
}

// resendEmail
func resendEmail(c *gin.Context) {
	var verificationResend VerificationResend
	err := c.BindJSON(&verificationResend)
	if err != nil {
		c.JSON(404, gin.H{"error": "Unable to retrieve email"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to connect to database!"})
		return
	}

	tx, err := conn.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to start transaction"})
		return
	}

	withinLimit := checkEmailResendLim(verificationResend.Email, conn)
	if !withinLimit {
		tx.Rollback()
		c.JSON(429, gin.H{"error": "Too many resend attempts. Please try again later."})
		return
	}

	token := checkJWT(verificationResend.Email)

	if token != "" {
		emailed := emailUser(verificationResend.Email, token)
		if !emailed {
			tx.Rollback()
			c.JSON(500, gin.H{"error": "Failed to send verification email"})
			return
		}
	} else {
		var user_id int32
		var username string
		err := conn.QueryRow(`SELECT id, username FROM users WHERE email = $1`, verificationResend.Email).Scan(&user_id, &username)
		if err != nil {
			tx.Rollback()
			c.JSON(404, gin.H{"error": "User not found"})
			return
		}

		tokenString, expiresAt, issuedAt, err := generateJWT(user_id, username, verificationResend.Email)
		if err != nil {
			tx.Rollback()
			c.JSON(500, gin.H{"error": "Failed to generate token"})
			return
		}

		_, err = tx.Exec(`INSERT INTO jwt_tokens (user_id, token_hash, expires_at, created_at, token_type)
							VALUES ($1, $2, $3, $4, 'verify_email')`,
			user_id, tokenString, expiresAt, issuedAt)
		if err != nil {
			tx.Rollback()
			c.JSON(500, gin.H{"error": "Failed to save token"})
			return
		}

		emailed := emailUser(verificationResend.Email, tokenString)
		if !emailed {
			tx.Rollback()
			c.JSON(500, gin.H{"error": "Failed to send verification email"})
			return
		}
	}

	// Use tx for increasing attempt
	var user_id int
	err = conn.QueryRow(`SELECT id FROM users WHERE email = $1`, verificationResend.Email).Scan(&user_id)
	if err == nil {
		_, err = tx.Exec(`INSERT INTO user_attempts (user_id, attempted_at, action)
			   VALUES ($1, NOW(), 'verification_email')`, user_id)
		// If this fails, rollback
		if err != nil {
			tx.Rollback()
			c.JSON(500, gin.H{"error": "Failed to record email attempt"})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(200, gin.H{"success": true})
}

// /auth/token - login, returns JWT (user_auth, 3h)
func authToken(c *gin.Context) {
	var req LoginRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	defer conn.Close()

	var user_id int32
	var username, email, password_hash string
	err = conn.QueryRow(`SELECT id, username, email, password_hash FROM users WHERE email = $1`, req.Email).Scan(&user_id, &username, &email, &password_hash)
	if err != nil {
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(password_hash), []byte(req.Password)) != nil {
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	// Increase attempt count for successful login
	_, _ = conn.Exec(`INSERT INTO user_attempts (user_id, attempted_at, action)
		VALUES ($1, NOW(), 'login')`, user_id)

	// Generate JWT for user_auth (3 hours)
	jwtKey := []byte(os.Getenv("SECRET_KEY"))
	issuedAt := time.Now()
	expiresAt := issuedAt.Add(3 * time.Hour)
	claims := Claims{
		UserID:   user_id,
		Username: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(issuedAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to generate token"})
		return
	}

	_, err = conn.Exec(`INSERT INTO jwt_tokens (user_id, token_hash, expires_at, created_at, token_type)
		VALUES ($1, $2, $3, $4, 'user_auth')`, user_id, tokenString, expiresAt, issuedAt)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to save token"})
		return
	}

	c.JSON(200, gin.H{
		"user_id":  user_id,
		"username": username,
		"email":    email,
		"token":    tokenString,
	})
}

// /auth/validate - validates JWT from Authorization header
func authValidate(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" || len(authHeader) < 8 || authHeader[:7] != "Bearer " {
		c.JSON(401, gin.H{"error": "Missing or invalid Authorization header"})
		return
	}
	tokenString := authHeader[7:]

	jwtKey := []byte(os.Getenv("SECRET_KEY"))
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		c.JSON(401, gin.H{"error": "Invalid token"})
		return
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		c.JSON(401, gin.H{"error": "Invalid token claims"})
		return
	}

	c.SetCookie(
		"access_token", // cookie name
		tokenString,    // cookie value
		3*3600,         // max age in seconds (3 hours)
		"/",            // path
		"",             // domain (empty string for default)
		true,           // secure (https only)
		true,           // HttpOnly
	)

	c.JSON(200, gin.H{
		"user_id":  claims.UserID,
		"username": claims.Username,
		"email":    claims.Email,
		"exp":      claims.ExpiresAt,
	})
}

// /users/request-password-reset - sends password reset JWT (reset_pwd, 5m) to email
func requestPasswordReset(c *gin.Context) {
	var req PasswordResetRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	defer conn.Close()

	// Check password reset attempt limit (max 3/hour)
	if !checkAttemptLimit(req.Email, conn, "pwd_reset_email", 3) {
		c.JSON(429, gin.H{"error": "Too many password reset requests. Please try again later."})
		return
	}

	var user_id int32
	var username string
	err = conn.QueryRow(`SELECT id, username FROM users WHERE email = $1`, req.Email).Scan(&user_id, &username)
	if err != nil {
		c.JSON(404, gin.H{"error": "User not found"})
		return
	}

	// Increase attempt count for password reset email
	_, _ = conn.Exec(`INSERT INTO user_attempts (user_id, attempted_at, action)
		VALUES ($1, NOW(), 'pwd_reset_email')`, user_id)

	// Generate JWT for reset_pwd (5 minutes)
	jwtKey := []byte(os.Getenv("SECRET_KEY"))
	issuedAt := time.Now()
	expiresAt := issuedAt.Add(5 * time.Minute)
	claims := Claims{
		UserID:   user_id,
		Username: username,
		Email:    req.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(issuedAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to generate token"})
		return
	}

	_, err = conn.Exec(`INSERT INTO jwt_tokens (user_id, token_hash, expires_at, created_at, token_type)
		VALUES ($1, $2, $3, $4, 'reset_pwd')`, user_id, tokenString, expiresAt, issuedAt)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to save token"})
		return
	}

	emailed := emailPasswordReset(req.Email, tokenString)
	if !emailed {
		c.JSON(500, gin.H{"error": "Failed to send password reset email"})
		return
	}

	c.JSON(200, gin.H{"success": true})
}

// /users/reset-password - resets password using valid JWT
func resetPassword(c *gin.Context) {
	var req PasswordReset
	if err := c.BindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	jwtKey := []byte(os.Getenv("SECRET_KEY"))
	token, err := jwt.ParseWithClaims(req.Token, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil || !token.Valid {
		c.JSON(401, gin.H{"error": "Invalid or expired token"})
		return
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		c.JSON(401, gin.H{"error": "Invalid token claims"})
		return
	}

	conn, err := get_db_conn()
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	defer conn.Close()

	// Hash new password
	passwordBytes := []byte(req.Password)
	if len(passwordBytes) > 72 {
		passwordBytes = passwordBytes[:72]
	}
	hashedPassword, err := bcrypt.GenerateFromPassword(passwordBytes, bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to hash password"})
		return
	}

	// Update password
	_, err = conn.Exec(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, string(hashedPassword), claims.UserID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to reset password"})
		return
	}

	c.JSON(200, gin.H{"success": true})
}

func main() {
	router := gin.Default()

	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// auth routes
	router.POST("/auth/token", authToken)
	router.POST("/auth/validate", authValidate)

	// signup
	router.POST("/users", createUser)

	// email verification
	router.POST("/users/verify-email", verifyEmail)
	router.POST("/users/resend-verification", resendEmail)

	// password reset
	router.POST("/users/request-password-reset", requestPasswordReset)
	router.POST("/users/reset-password", resetPassword)

	router.Run(":8080")
}
