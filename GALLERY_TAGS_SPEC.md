# FinalVault — Gallery Category Tags Spec
## Target Release: v1.1.4

---

## Overview

A photographer-owned tag library for categorizing galleries. Tags are created once and reused across any number of galleries. The tag system integrates with the existing dashboard search and filter bar, allowing photographers to quickly find galleries by category. Tags are scoped per photographer — no shared or global tag pool.

---

## Data Model

### `gallery_tags` table
```sql
CREATE TABLE gallery_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,                        -- optional hex color e.g. '#6366f1'
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (photographer_id, name)               -- tag names unique per photographer
);
```

### `gallery_tag_assignments` table
```sql
CREATE TABLE gallery_tag_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES gallery_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (gallery_id, tag_id)                  -- no duplicate assignments
);
```

### RLS Policies
- `gallery_tags`: photographers read/write only their own rows (`photographer_id = auth.uid()` via join to `photographers`)
- `gallery_tag_assignments`: photographers read/write assignments for galleries they own

---

## Features

### Tag Library Management (`/account?tab=tags`)
- List all tags with name, color dot, and usage count ("cosplay · 12 galleries")
- Create new tag (name + optional color)
- Rename a tag — updates everywhere it's assigned
- Recolor a tag
- Delete a tag — removes all assignments (with confirmation warning showing usage count)
- Empty state with prompt to create first tag

### Assigning Tags to Galleries (`GallerySettings → General`)
- Tag input field with typeahead autocomplete from the photographer's tag library
- Type and press Enter or click a suggestion to assign
- Create a new tag inline — if typed name doesn't exist, offer "Create tag: [name]"
- Assigned tags shown as pills with × to remove
- No limit on tags per gallery

### Dashboard Search
- `applyFilters` includes tag names in the search query match
- If a gallery has a tag named "convention" and the user searches "convention", that gallery surfaces
- Works across folders — same flattening behavior as the existing search

### Dashboard Filter Pill
- New `TagsPill` filter component alongside Status / Event Date / Expiry Date
- Multi-select dropdown — pick one or more tags
- Filter logic: OR (show galleries with **any** of the selected tags)
- Active state shows selected tag count: "Tags · 2"
- Included in `MobileFilterSheet` for mobile
- "Clear all" resets tag filter along with other filters

### Gallery Cards (optional)
- Show up to 3 tag pills on the gallery card in a subtle style
- Overflow handled with "+N more" if more than 3 tags assigned

---

## UI Touchpoints

| Location | Change |
|----------|--------|
| `Account` | New "Tags" tab for tag library management |
| `GallerySettings → General` | Tag assignment input with autocomplete and inline create |
| `Dashboard` | `TagsPill` filter component in the filter bar |
| `Dashboard` | `MobileFilterSheet` — tags section added |
| `Dashboard` | `applyFilters` — tag name included in search match |
| `GalleryCard` | Optional tag pill display (up to 3, overflow "+N more") |

---

## API (`galleryApi.js` additions)

| Function | Description |
|----------|-------------|
| `getTags(photographerId)` | Fetch all tags for the photographer with usage counts |
| `createTag(name, color)` | Create a new tag |
| `updateTag(id, { name, color })` | Rename or recolor a tag |
| `deleteTag(id)` | Delete tag and all assignments |
| `getGalleryTags(galleryId)` | Fetch tags assigned to a specific gallery |
| `assignTag(galleryId, tagId)` | Assign a tag to a gallery |
| `removeTag(galleryId, tagId)` | Remove a tag assignment from a gallery |
| `createAndAssignTag(galleryId, name, color)` | Create new tag and immediately assign it |

---

## Future / Deferred

**Tag-based public gallery collections (v1.4+):** A shareable URL that shows all galleries tagged with a specific tag (e.g. `/collection/{token}?tag=convention-2026`) to a client. The schema above supports this — `gallery_tags` and `gallery_tag_assignments` are structured to allow a public-facing query against a photographer's tag. No additional schema changes needed when this is built.

**Bulk tag assignment:** Select multiple galleries from the dashboard → "Add tag" action. Deferred until there's a gallery multi-select pattern in the UI.

**Sort/group by tag:** Group the gallery grid visually by tag. Lower priority — filter covers the core use case.

---

## Out of Scope for v1.1.4
- Public-facing tag collection pages
- Bulk tag assignment
- Tag sorting / grouping on dashboard
- Tag import/export

---

## Build Order
1. SQL migrations (`gallery_tags`, `gallery_tag_assignments`, RLS policies)
2. `galleryApi.js` — all tag API functions
3. Account → Tags tab (library management: create, rename, recolor, delete, usage count)
4. `GallerySettings → General` — tag assignment input with autocomplete and inline create
5. `Dashboard` — include tag names in `applyFilters` search
6. `TagsPill` component — multi-select filter dropdown
7. `Dashboard` — wire `TagsPill` into filter bar and `MobileFilterSheet`
8. `GalleryCard` — optional tag pill display

---

*FinalVault Gallery Tags Spec — prepared June 2026*
