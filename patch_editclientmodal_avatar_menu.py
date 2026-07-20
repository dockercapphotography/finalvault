import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

old_block = '''            {/* Avatar + name row */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden" style={{ background: 'var(--accent)' }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="w-10 h-10 object-cover" />
                  : <div className="w-10 h-10 flex items-center justify-center text-sm font-bold" style={{ color: 'var(--accent-fg)' }}>
                      {client.first_name[0]}{client.last_name[0]}
                    </div>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer flex-shrink-0"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  <input type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} disabled={uploadingAvatar} />
                  {uploadingAvatar ? 'Uploading...' : 'Change photo'}
                </label>
                <button onClick={onChooseFromGallery} disabled={uploadingAvatar}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}>
                  Choose from gallery
                </button>
              </div>
            </div>'''

assert src.count(old_block) == 1, "EditClientModal avatar row anchor not found or not unique"

new_block = '''            {/* Avatar + name row -- same menu control as the main client page,
                so both places offer Upload photo / Choose from gallery the
                same way instead of one being a menu and the other two
                separate buttons */}
            <div className="flex items-center gap-3">
              <AvatarChangeControl
                client={client}
                avatarUrl={avatarUrl}
                uploadingAvatar={uploadingAvatar}
                onAvatarUpload={onAvatarUpload}
                onChooseFromGallery={onChooseFromGallery}
              />
              {uploadingAvatar && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Uploading...</span>}
            </div>'''

src = src.replace(old_block, new_block)
path.write_text(src)
print("EditClientModal now uses the same AvatarChangeControl menu as the main client page")
