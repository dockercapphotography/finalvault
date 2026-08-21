def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

# Remove from NotificationsTab
patch('src/routes/Account.jsx',
      "      <PushNotificationsSection photographerId={user?.id} />\n      <CustomDomainSection photographerId={user?.id} />",
      "      <PushNotificationsSection photographerId={user?.id} />")

# Add into ProfileTab, right after the Security section closes
patch('src/routes/Account.jsx',
      "          {securityMsg && <p className=\"text-sm\" style={{ color: securityMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{securityMsg.text}</p>}\n        </div>\n      </SettingsSection>\n    </div>\n  )\n}",
      "          {securityMsg && <p className=\"text-sm\" style={{ color: securityMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{securityMsg.text}</p>}\n        </div>\n      </SettingsSection>\n\n      <CustomDomainSection photographerId={user?.id} />\n    </div>\n  )\n}")

print("\nAll patches applied successfully.")
