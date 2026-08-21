def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

patch('src/components/galleries/ShareButton.jsx',
      "import PortalMenu from '../ui/PortalMenu.jsx'",
      "import PortalMenu from '../ui/PortalMenu.jsx'\nimport { getPublicBaseUrl } from '../../utils/publicBaseUrl.js'")

patch('src/components/galleries/ShareButton.jsx',
      "function DirectLinkModal({ gallery, onClose }) {\n  const galleryUrl = `${window.location.origin}/g/${gallery.share_token}`",
      "function DirectLinkModal({ gallery, onClose }) {\n  const [baseUrl, setBaseUrl] = useState(window.location.origin)\n  useEffect(() => { getPublicBaseUrl().then(setBaseUrl) }, [])\n  const galleryUrl = `${baseUrl}/g/${gallery.share_token}`")

patch('src/components/galleries/ShareButton.jsx',
      "function QRCodeModal({ gallery, onClose }) {\n  const canvasRef = useRef(null)\n  const galleryUrl = `${window.location.origin}/g/${gallery.share_token}`",
      "function QRCodeModal({ gallery, onClose }) {\n  const canvasRef = useRef(null)\n  const [baseUrl, setBaseUrl] = useState(window.location.origin)\n  useEffect(() => { getPublicBaseUrl().then(setBaseUrl) }, [])\n  const galleryUrl = `${baseUrl}/g/${gallery.share_token}`")

patch('src/components/galleries/ShareButton.jsx',
      "  const galleryUrl = `${window.location.origin}/g/${gallery.share_token}`",
      "  const [baseUrl, setBaseUrl] = useState(window.location.origin)\n  useEffect(() => { getPublicBaseUrl().then(setBaseUrl) }, [])\n  const galleryUrl = `${baseUrl}/g/${gallery.share_token}`")

print("\nAll patches applied successfully.")
