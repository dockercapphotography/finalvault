import ClassicTemplate from './ClassicTemplate.jsx'
import MinimalTemplate from './MinimalTemplate.jsx'
import EditorialTemplate from './EditorialTemplate.jsx'
import BoldTemplate from './BoldTemplate.jsx'

export const TEMPLATES = [
  { id: 'classic',   name: 'Classic',   component: ClassicTemplate },
  { id: 'minimal',   name: 'Minimal',   component: MinimalTemplate },
  { id: 'editorial', name: 'Editorial', component: EditorialTemplate },
  { id: 'bold',      name: 'Bold',      component: BoldTemplate },
]

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0]
}
