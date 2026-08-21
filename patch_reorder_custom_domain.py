def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

# Remove from after Security
patch('src/routes/Account.jsx',
      "      </SettingsSection>\n\n      <CustomDomainSection photographerId={user?.id} />\n    </div>\n  )",
      "      </SettingsSection>\n    </div>\n  )")

# Add right after Personal Information, before Storage
patch('src/routes/Account.jsx',
      "      </SettingsSection>\n\n      {storageInfo && (",
      "      </SettingsSection>\n\n      <CustomDomainSection photographerId={user?.id} />\n\n      {storageInfo && (")

print("\nAll patches applied successfully.")
