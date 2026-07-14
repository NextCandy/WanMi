ALTER TABLE site_settings ADD COLUMN show_admin_link_in_footer INTEGER NOT NULL DEFAULT 1 CHECK (show_admin_link_in_footer IN (0, 1));
