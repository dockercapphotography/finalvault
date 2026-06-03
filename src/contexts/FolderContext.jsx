import { createContext, useContext } from 'react'

export const FolderContext = createContext({
  folders: [],
  currentFolderId: null,
  onGalleryMoved: () => {},
  onGalleryDeleted: () => {},
  onCopyLink: () => {},
})

export function useFolderContext() {
  return useContext(FolderContext)
}
