import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from './alert-dialog'

const nativeCss = readFileSync('src/styles/native.css', 'utf8')

describe('native alert dialog theming', () => {
  afterEach(cleanup)

  it('marks opt-in portal content without changing ordinary web dialogs', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent nativeTheme>
          <AlertDialogTitle>Native confirmation</AlertDialogTitle>
          <AlertDialogDescription>Confirm the action.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    )
    expect(screen.getByRole('alertdialog')).toHaveClass('native-themed-dialog')

    cleanup()
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Web confirmation</AlertDialogTitle>
          <AlertDialogDescription>Confirm the action.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    )
    expect(screen.getByRole('alertdialog')).not.toHaveClass('native-themed-dialog')
  })

  it('gives native portal content self-contained dark tokens', () => {
    expect(nativeCss).toMatch(/\.dark \.native-themed-dialog\s*\{[^}]*--native-dialog-background:\s*#202c26/)
    expect(nativeCss).toMatch(/\.dark \.native-themed-dialog\s*\{[^}]*background:\s*var\(--native-dialog-background\)/)
    expect(nativeCss).toMatch(/\.dark \.native-themed-dialog \.native-themed-dialog-description[^{]*\{[^}]*color:\s*var\(--native-dialog-muted\)/)
  })

  it('opts every native route confirmation into the portal theme', () => {
    const listing = readFileSync('src/pages/ListingDetailPage.tsx', 'utf8')
    const business = readFileSync('src/pages/BusinessProfilePage.tsx', 'utf8')
    expect(listing.match(/<AlertDialogContent nativeTheme=\{native\}>/g)).toHaveLength(2)
    expect(business.match(/<AlertDialogContent nativeTheme=\{native\}>/g)).toHaveLength(1)
  })
})
