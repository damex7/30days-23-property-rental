// CLIENT COMPONENT: picks files, uploads them straight to Vercel Blob with
// progress, and reorders, re-describes and deletes photos.
'use client'

import { upload } from '@vercel/blob/client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition, type DragEvent } from 'react'
import { deletePhotoAction, recordPhotoAction, reorderPhotosAction, updateAltAction } from '@/app/host/actions'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_TYPES } from '@/lib/options'

type Photo = { id: string; url: string; alt: string; width: number; height: number }
type Queued = { key: string; file: File; preview: string; alt: string; status: 'ready' | 'uploading' | 'saving' | 'failed'; progress: number; error?: string }

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** The pixel size, read in the browser (so next/image can reserve the right space). */
async function dimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

/**
 * THE PHOTO MANAGER.
 * - Choose up to 12 JPEG, PNG or WebP files (5 MB each). Wrong type or too
 *   big is refused here at once, with the reason, per file; the server and
 *   Blob refuse them again whatever this code does.
 * - Every photo needs ALT TEXT (what a screen reader user hears instead of
 *   seeing it): the Upload button stays off until it's written.
 * - Each file shows its own progress and its own failure, announced politely.
 * - Order: drag and drop, OR the "Move earlier / later" and "Make cover"
 *   buttons (the keyboard and screen-reader way). The first photo is the
 *   cover. The new order is saved in one transaction.
 */
export function PhotoManager({ listingId, photos, readOnly }: { listingId: string; photos: Photo[]; readOnly: boolean }) {
  const router = useRouter()
  const [order, setOrder] = useState(photos)
  const [queue, setQueue] = useState<Queued[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [pending, startTransition] = useTransition()
  const [dragId, setDragId] = useState<string | null>(null)
  const inputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  // When the server's list changes (after a save), start again from it.
  const [seen, setSeen] = useState(photos)
  if (photos !== seen) {
    setSeen(photos)
    setOrder(photos)
  }

  const room = MAX_PHOTOS - order.length - queue.filter((q) => q.status !== 'failed').length

  function patch(key: string, change: Partial<Queued>) {
    setQueue((items) => items.map((item) => (item.key === key ? { ...item, ...change } : item)))
  }

  function pick(files: FileList | null) {
    if (!files) return
    const added: Queued[] = []
    let space = room
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`
      const base = { key, file, preview: URL.createObjectURL(file), alt: '', progress: 0 }
      if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) added.push({ ...base, status: 'failed', error: 'Only JPEG, PNG or WebP photos.' })
      else if (file.size > MAX_PHOTO_BYTES) added.push({ ...base, status: 'failed', error: `Too big (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is 5 MB.` })
      else if (space <= 0) added.push({ ...base, status: 'failed', error: `A listing can have up to ${MAX_PHOTOS} photos.` })
      else {
        added.push({ ...base, status: 'ready' })
        space--
      }
    }
    setQueue((items) => [...items, ...added])
    setAnnouncement(`${added.length} file${added.length === 1 ? '' : 's'} added. Describe each photo, then upload.`)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function send(item: Queued) {
    if (item.alt.trim().length < 5) {
      patch(item.key, { error: 'Describe the photo in at least 5 characters first.' })
      return
    }
    patch(item.key, { status: 'uploading', progress: 0, error: undefined })
    setAnnouncement(`Uploading ${item.file.name}.`)
    try {
      const { width, height } = await dimensions(item.file)
      // A RANDOM pathname under this listing: unguessable, and the server
      // checks it really is under this listing before issuing the token.
      const pathname = `listings/${listingId}/${crypto.randomUUID().replace(/-/g, '')}.${EXT[item.file.type] ?? 'jpg'}`
      const blob = await upload(pathname, item.file, {
        access: 'public',
        handleUploadUrl: '/api/photos/upload',
        clientPayload: JSON.stringify({ listingId }),
        contentType: item.file.type,
        onUploadProgress: ({ percentage }) => patch(item.key, { progress: Math.round(percentage) }),
      })
      patch(item.key, { status: 'saving', progress: 100 })
      const saved = await recordPhotoAction({ listingId, url: blob.url, width, height, alt: item.alt.trim() })
      if (!saved.ok) throw new Error(saved.message)
      setQueue((items) => items.filter((q) => q.key !== item.key))
      URL.revokeObjectURL(item.preview)
      setAnnouncement(`${item.file.name} uploaded.`)
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The upload failed.'
      patch(item.key, { status: 'failed', error: message })
      setAnnouncement(`${item.file.name} failed: ${message}`)
    }
  }

  function saveOrder(next: Photo[], message: string) {
    setOrder(next)
    setAnnouncement(message)
    startTransition(async () => {
      const result = await reorderPhotosAction(listingId, next.map((p) => p.id))
      if (!result.ok) {
        setOrder(photos)
        setAnnouncement(result.message)
      }
    })
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(to, 0, item)
    saveOrder(next, to === 0 ? 'Cover photo changed.' : `Photo moved to position ${to + 1} of ${next.length}.`)
  }

  function onDrop(event: DragEvent, targetId: string) {
    event.preventDefault()
    if (!dragId || dragId === targetId) return
    const from = order.findIndex((p) => p.id === dragId)
    const to = order.findIndex((p) => p.id === targetId)
    setDragId(null)
    move(from, to)
  }

  return (
    <div>
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {order.length === 0 ? <p className="mb-4 text-muted">No photos yet. Add at least 3: the first one is the cover.</p> : null}
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((photo, i) => (
          <li
            key={photo.id}
            draggable={!readOnly}
            onDragStart={() => setDragId(photo.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, photo.id)}
            className={cn('panel overflow-hidden', dragId === photo.id && 'opacity-60', pending && 'cursor-progress')}
          >
            <div className="relative aspect-[3/2] bg-sunken">
              <Image src={photo.url} alt={photo.alt} fill sizes="(min-width: 1024px) 30vw, 50vw" className="object-cover" />
              {i === 0 ? <span className="tag-sand absolute top-2 left-2 px-2.5 py-0.5 text-xs">Cover</span> : null}
              <span className="absolute top-2 right-2 rounded-pill bg-card/90 px-2 text-xs font-semibold">{i + 1}</span>
            </div>
            <div className="space-y-2 p-3">
              <AltEditor listingId={listingId} photo={photo} readOnly={readOnly} onDone={setAnnouncement} />
              {!readOnly ? (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={button.small} onClick={() => move(i, i - 1)} disabled={i === 0}>
                    <Icon name="arrowLeft" className="size-4" />
                    Earlier<span className="sr-only">: move photo {i + 1} earlier</span>
                  </button>
                  <button type="button" className={button.small} onClick={() => move(i, i + 1)} disabled={i === order.length - 1}>
                    Later<span className="sr-only">: move photo {i + 1} later</span>
                    <Icon name="arrowRight" className="size-4" />
                  </button>
                  {i > 0 ? (
                    <button type="button" className={button.small} onClick={() => move(i, 0)}>Make cover</button>
                  ) : null}
                  <DeleteButton listingId={listingId} photoId={photo.id} index={i} onDone={setAnnouncement} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {!readOnly ? (
        <section aria-labelledby={`${inputId}-title`} className="mt-6 rounded-card border border-dashed border-edge bg-sunken p-4">
          <h3 id={`${inputId}-title`} className="font-sans text-base font-semibold">Add photos</h3>
          <p className="text-sm text-muted">JPEG, PNG or WebP, up to 5 MB each. {room > 0 ? `Room for ${room} more.` : 'This listing has the maximum of 12.'}</p>
          <label htmlFor={inputId} className={cn(button.secondary, 'mt-3 cursor-pointer', room <= 0 && 'pointer-events-none opacity-50')}>
            <Icon name="upload" />
            Choose photos
          </label>
          <input ref={fileInput} id={inputId} type="file" accept={PHOTO_TYPES.join(',')} multiple className="sr-only" disabled={room <= 0} onChange={(e) => pick(e.target.files)} />

          {queue.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {queue.map((item) => (
                <li key={item.key} className="flex flex-col gap-3 rounded-control border border-rule bg-card p-3 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not a page image */}
                  <img src={item.preview} alt="" className="h-24 w-36 shrink-0 rounded-control object-cover" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="truncate text-sm font-semibold">{item.file.name}</p>
                    {item.status === 'ready' || (item.status === 'failed' && (PHOTO_TYPES as readonly string[]).includes(item.file.type) && item.file.size <= MAX_PHOTO_BYTES) ? (
                      <>
                        <label htmlFor={`alt-${item.key}`} className="block text-sm font-semibold">Describe this photo</label>
                        <input
                          id={`alt-${item.key}`}
                          value={item.alt}
                          maxLength={200}
                          onChange={(e) => patch(item.key, { alt: e.target.value })}
                          placeholder="Bedroom with a king bed and a wall AC"
                          aria-describedby={item.error ? `err-${item.key}` : undefined}
                          aria-invalid={item.error ? true : undefined}
                          className="field min-h-11 w-full px-3"
                        />
                      </>
                    ) : null}
                    {item.status === 'uploading' || item.status === 'saving' ? (
                      <div>
                        <progress value={item.progress} max={100} className="h-2 w-full accent-primary" aria-label={`Uploading ${item.file.name}`} />
                        <p className="text-sm text-muted">{item.status === 'saving' ? 'Saving…' : `${item.progress}%`}</p>
                      </div>
                    ) : null}
                    {item.error ? (
                      <p id={`err-${item.key}`} className="flex items-start gap-1.5 text-sm font-semibold text-danger">
                        <Icon name="errorCircle" className="size-4" />
                        {item.error}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {item.status === 'ready' || (item.status === 'failed' && item.alt) ? (
                        <button type="button" className={button.primary} onClick={() => send(item)} disabled={item.alt.trim().length < 5}>
                          {item.status === 'failed' ? 'Try again' : 'Upload'}
                        </button>
                      ) : null}
                      {item.status === 'ready' || item.status === 'failed' ? (
                        <button type="button" className={button.ghost} onClick={() => setQueue((items) => items.filter((q) => q.key !== item.key))}>Remove</button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function AltEditor({ listingId, photo, readOnly, onDone }: { listingId: string; photo: Photo; readOnly: boolean; onDone: (message: string) => void }) {
  const [alt, setAlt] = useState(photo.alt)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const id = `alt-${photo.id}`
  if (readOnly) return <p className="text-sm">{photo.alt}</p>
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">Description (alt text)</label>
      <div className="mt-1 flex gap-1.5">
        <input id={id} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className="field min-h-10 w-full px-2.5 text-sm" />
        <button
          type="button"
          className={button.small}
          disabled={pending || alt === photo.alt}
          onClick={() =>
            start(async () => {
              const result = await updateAltAction(listingId, photo.id, alt)
              setError(result.ok ? null : result.message)
              onDone(result.ok ? 'Description saved.' : result.message)
            })
          }
        >
          Save
        </button>
      </div>
      {error ? <p id={`${id}-err`} className="mt-1 text-sm font-semibold text-danger">{error}</p> : null}
    </div>
  )
}

function DeleteButton({ listingId, photoId, index, onDone }: { listingId: string; photoId: string; index: number; onDone: (message: string) => void }) {
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()
  if (!asking) {
    return (
      <button type="button" className={button.small} onClick={() => setAsking(true)}>
        <Icon name="trash" className="size-4" />
        Delete<span className="sr-only"> photo {index + 1}</span>
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1.5" role="group" aria-label={`Delete photo ${index + 1}?`}>
      <button
        type="button"
        className={`${button.small} border-danger text-danger`}
        disabled={pending}
        onClick={() => start(async () => {
          const result = await deletePhotoAction(listingId, photoId)
          onDone(result.ok ? 'Photo deleted.' : result.message)
          setAsking(false)
        })}
      >
        Yes, delete
      </button>
      <button type="button" className={button.small} onClick={() => setAsking(false)} autoFocus>Keep</button>
    </span>
  )
}
