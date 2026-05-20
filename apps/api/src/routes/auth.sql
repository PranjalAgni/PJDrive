/* @name InsertUser */
INSERT INTO users (email, password_hash)
VALUES (:email, :passwordHash)
RETURNING id, email, created_at;

/* @name GetUserByEmail */
SELECT id, email, password_hash
FROM users
WHERE email = :email;
