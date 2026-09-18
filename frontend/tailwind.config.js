/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
		// Private overlay (internal build) — scan classes used by internal-only
		// components such as PracticeAndResearch, AttackLeaderboardApp, etc.,
		// otherwise those classes are purged from the final CSS and the layout
		// collapses in the internal production build.
		'./private/**/*.{ts,tsx}',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: '#4A90E2',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				accent: {
					DEFAULT: '#F5A623',
					foreground: 'hsl(var(--accent-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
				brand: '#0d46f2',
				security: {
					red: '#ff5252',
					orange: '#ff9100',
					green: '#00e676',
					bg: '#f8fafc'
				},
				// A.I.G Pro 平台 token（旧聊天 UI 不使用，仅供 platform/ 组件族）
				plat: {
					brand: 'var(--brand)',
					'brand-deep': 'var(--brand-deep)',
					'brand-fixed': 'var(--brand-fixed)',
					surface: 'var(--surface)',
					'surface-low': 'var(--surface-low)',
					'surface-mid': 'var(--surface-mid)',
					ink: 'var(--ink)',
					'ink-2': 'var(--ink-2)',
					muted: 'var(--plat-muted)',
					outline: 'var(--outline)',
					'outline-strong': 'var(--outline-strong)',
				},
				series: {
					1: 'var(--series-1)',
					2: 'var(--series-2)',
					3: 'var(--series-3)',
					4: 'var(--series-4)',
					5: 'var(--series-5)',
				},
				sev: {
					1: 'var(--sev-1)',
					2: 'var(--sev-2)',
					3: 'var(--sev-3)',
					4: 'var(--sev-4)',
					5: 'var(--sev-5)',
				},
				met: {
					1: 'var(--met-1)',
					2: 'var(--met-2)',
					3: 'var(--met-3)',
					4: 'var(--met-4)',
					5: 'var(--met-5)',
				},
				st: {
					good: 'var(--st-good)', 'good-t': 'var(--st-good-t)', 'good-bg': 'var(--st-good-bg)',
					warn: 'var(--st-warn)', 'warn-t': 'var(--st-warn-t)', 'warn-bg': 'var(--st-warn-bg)',
					ser: 'var(--st-ser)', 'ser-t': 'var(--st-ser-t)', 'ser-bg': 'var(--st-ser-bg)',
					crit: 'var(--st-crit)', 'crit-t': 'var(--st-crit-t)', 'crit-bg': 'var(--st-crit-bg)',
					info: 'var(--st-info)', 'info-t': 'var(--st-info-t)', 'info-bg': 'var(--st-info-bg)',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				'eight': '8px',
				'plat': 'var(--plat-radius)',
			},
			boxShadow: {
				'plat-card': 'var(--shadow-card)',
			},
			fontFamily: {
				head: 'var(--font-head)',
				body: 'var(--font-body)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: 0 },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: 0 },
				},
				'skill-market-breath': {
					'0%, 100%': {
						transform: 'scale(1)',
						boxShadow: '0 0 0 0 rgba(244, 63, 94, 0.55)',
					},
					'50%': {
						transform: 'scale(1.12)',
						boxShadow: '0 0 8px 2px rgba(244, 63, 94, 0.45)',
					},
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'skill-market-breath': 'skill-market-breath 1.8s ease-in-out infinite',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
}