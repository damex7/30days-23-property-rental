import { NotFoundContent } from '@/components/site/not-found-content'

/** A slug that doesn't exist, or a listing that isn't published (draft, paused, archived). */
export default function ListingNotFound() {
  return <NotFoundContent />
}
