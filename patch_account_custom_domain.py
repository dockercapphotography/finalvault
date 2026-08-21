import sys

def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

patch('src/routes/Account.jsx',
      "import PushNotificationsSection from '../components/account/PushNotificationsSection.jsx'",
      "import PushNotificationsSection from '../components/account/PushNotificationsSection.jsx'\nimport CustomDomainSection from '../components/account/CustomDomainSection.jsx'")

patch('src/routes/Account.jsx',
      "      <PushNotificationsSection photographerId={user?.id} />",
      "      <PushNotificationsSection photographerId={user?.id} />\n      <CustomDomainSection photographerId={user?.id} />")

print("\nAll patches applied successfully.")
