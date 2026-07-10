const year = new Date().getFullYear()

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L2.25 2.25h6.988l4.26 5.637zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

const MediumIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
  </svg>
)

const ICON_LINKS = [
  { href: 'https://github.com/raymonepping',           label: 'GitHub',   Icon: GithubIcon   },
  { href: 'https://x.com/doctor_nosql',                label: 'X',        Icon: XIcon        },
  { href: 'https://www.linkedin.com/in/raymonepping/', label: 'LinkedIn', Icon: LinkedInIcon },
  { href: 'https://medium.com/@raymonepping',          label: 'Medium',   Icon: MediumIcon   },
]

const WORDS = ['Read', 'Collect', 'Discover', 'Recommend']

export default function Footer() {
  return (
    <footer
      className="fixed bottom-0 left-0 w-full z-40 hidden md:block"
      style={{
        background: 'linear-gradient(to top, rgba(13,13,13,0.95), rgba(13,13,13,0.65))',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div className="flex items-center justify-between gap-4 px-7 py-3">
        <span className="text-xs flex flex-wrap items-center gap-x-1.5" style={{ color: 'rgba(255,255,255,0.40)' }}>
          © {year} raymonepping
          {WORDS.map((w) => (
            <span key={w} className="flex items-center gap-x-1.5">
              <span style={{ color: 'rgba(255,255,255,0.18)' }}>·</span>
              <span
                className="transition-all duration-150 cursor-default"
                style={{ display: 'inline-block' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(232,160,32,0.85)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.transform = '' }}
              >
                {w}
              </span>
            </span>
          ))}
        </span>

        <div className="flex items-center gap-2">
          {ICON_LINKS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.65)' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(232,160,32,0.14)'
                e.currentTarget.style.color = '#e8a020'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.65)'
                e.currentTarget.style.transform = ''
              }}
            >
              <Icon />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
