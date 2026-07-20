import pathlib

path = pathlib.Path("tests/e2e/photographer/crm.spec.js")
src = path.read_text()

# getByText(FIXTURE_GALLERY.title) matched two elements: the picker's own
# gallery-row button AND the same-titled gallery link already visible on
# the client detail page behind the modal (since this test links the
# client to FIXTURE_GALLERY, it now shows up in that client's own
# galleries list too). Scoping by role distinguishes them -- the picker's
# row is a <button>, the background one is an <a> link.
old_block = '''      await expect(page.getByText('Choose from a gallery')).toBeVisible()
      await expect(page.getByText(FIXTURE_GALLERY.title)).toBeVisible()

      await page.getByText(FIXTURE_GALLERY.title).click()'''

assert src.count(old_block) == 1, "gallery picker locator anchor not found or not unique"

new_block = '''      await expect(page.getByText('Choose from a gallery')).toBeVisible()
      await expect(page.getByRole('button', { name: FIXTURE_GALLERY.title })).toBeVisible()

      await page.getByRole('button', { name: FIXTURE_GALLERY.title }).click()'''

src = src.replace(old_block, new_block)
path.write_text(src)
print("Fixed the strict-mode locator collision in the gallery picker test")
