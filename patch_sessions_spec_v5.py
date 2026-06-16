path = '/Users/nickporterfield/code/finalvault/tests/e2e/photographer/sessions.spec.js'
with open(path, 'r') as f:
    src = f.read()

old = '    await expect(page.getByText(q.name)).not.toBeVisible({ timeout: 5000 })'
new = '    await expect(page.locator("p.text-sm.font-medium").filter({ hasText: q.name })).not.toBeVisible({ timeout: 5000 })'
assert src.count(old) == 1, f"FAIL: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ Fixed delete assertion to scope to template name paragraph")
