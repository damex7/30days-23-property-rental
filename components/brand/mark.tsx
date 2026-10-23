/**
 * THE MARK: a guesthouse key on a split ring, drawn by hand as one path
 * set (no icon pack), with a jacaranda blossom for a fob. It takes its
 * colour from `currentColor`, so `text-primary` makes it jacaranda in light
 * mode and the lighter jacaranda at night.
 */
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* the ring: slightly open, like a split ring, and not quite round */}
      <path d="M17.5 7.2c4.6-1.9 9.7.2 11.3 4.6 1.6 4.4-.8 9.3-5.4 10.9-4.5 1.6-9.4-.6-11-4.9-1.1-3-.4-6.1 1.6-8.3" />
      {/* the key's bow, hanging from the ring */}
      <path d="M24.9 21.6c2.6.4 4.6 2.7 4.4 5.4-.2 2.8-2.6 4.9-5.4 4.7-2.7-.2-4.8-2.6-4.6-5.3" />
      <circle cx="24.1" cy="26.7" r="1.3" />
      {/* the shank and its two teeth, drawn a little wobbly */}
      <path d="M23.6 31.8 22.9 43.2" />
      <path d="M23.1 38.4l3.6.2M22.95 41.6l2.6.15" />
      {/* the jacaranda blossom fob: five petals */}
      <g strokeWidth="1.6">
        <path d="M11.2 19.6c-1.6-.9-1.8-3-.4-4 1.2-.9 2.9-.3 3.3 1.1" />
        <path d="M14.1 16.7c.8-1.6 3-1.7 3.9-.3.8 1.2.1 2.8-1.3 3.2" />
        <path d="M16.7 19.6c1.7.3 2.5 2.3 1.4 3.6-1 1.1-2.7.9-3.4-.3" />
        <path d="M14.7 22.9c-.6 1.6-2.8 2-3.9.8-1-1-.6-2.7.7-3.3" />
        <path d="M11.5 20.2c-1.7-.1-2.8-2-1.9-3.4" />
      </g>
    </svg>
  )
}
