USE mailserver;

-- Generate explicit salt (random string)
SET @salt = SUBSTRING(MD5(RAND()), 1, 8); 

-- Create password hash: {SHA512-CRYPT}$6$salt$hash...
-- Note: MariaDB doesn't have a built-in crypt() that does SHA512. 
-- We will use a fixed known hash for "ChangeMe123!" for simplicity in this initial script, 
-- or rely on the fact that Dovecot can handle other schemes.
-- Ideally, we'd use doveadm pw -s SHA512-CRYPT to generate this.

-- Let's use a shell script wrapper instead to generate the hash using doveadm.
