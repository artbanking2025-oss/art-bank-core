-- Create default admin user for Art Bank Core
-- Password: AdminPass123! (hashed with SHA-256)
-- NOTE: Change password immediately after first login

INSERT OR IGNORE INTO users (
  id, 
  email, 
  password_hash, 
  full_name, 
  role, 
  created_at
) VALUES (
  'admin-user-1',
  'admin@artbank.io',
  -- SHA-256 hash of 'AdminPass123!'
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
  'System Administrator',
  'admin',
  datetime('now')
);

-- Log the creation
SELECT 'Admin user created: admin@artbank.io (password: AdminPass123!)' as message;
