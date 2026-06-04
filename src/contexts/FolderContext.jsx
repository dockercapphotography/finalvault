import { createContext, useContext } from 'react'

export const FolderContext = createContext({
  folders: [],
  currentFolderId: null,
  folderPath: [],
  onGalleryMoved: () => {},
  onGalleryDeleted: () => {},
  onCopyLink: () => {},
})

export function useFolderContext() {
  return useContext(FolderContext)
}
