// CLIENT COMPONENTS: the steps of the listing form. Each step is its own
// <form> with its own Server Action, so every step SAVES A DRAFT before
// moving on: a host who closes the tab after "Pricing" finds everything up
// to Pricing saved. Each carries the listing's version for optimistic
// concurrency (two tabs can't silently overwrite each other).
'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { ErrorSummary } from '@/components/forms/error-summary'
import { LocationPicker } from '@/components/map/location-picker'
import { NairaField, SelectField, TextAreaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { koboToInput } from '@/lib/money'
import { AMENITY_GROUP_LABELS, AMENITY_GROUPS, CANCELLATION_POLICIES, POLICY_LABELS, PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from '@/lib/options'
import type { HostListing } from '@/lib/repos/listings'
import type { FormState } from '@/lib/validation'

type Action = (state: FormState, formData: FormData) => Promise<FormState>

const LABELS: Record<string, string> = {
  title: 'Title', description: 'Description', propertyType: 'Type of place', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', maxGuests: 'Guests',
  state: 'State', city: 'City', area: 'Area', addressLine: 'Street address', lat: 'Latitude', lng: 'Longitude',
  nightly: 'Nightly price', weekend: 'Weekend price', cleaningFee: 'Cleaning fee', cautionDeposit: 'Caution deposit', weeklyDiscountPercent: 'Weekly discount', minNights: 'Minimum nights', maxNights: 'Maximum nights', cancellationPolicy: 'Cancellation policy',
  houseRules: 'House rules', checkInTime: 'Check-in time', checkOutTime: 'Check-out time', checkinInstructions: 'Check-in instructions', amenities: 'Amenities',
}

/** The frame every step shares: the error summary, the hidden id and version, and the Save button. */
function StepForm({ action, listing, children, submitLabel = 'Save and continue' }: { action: Action; listing?: Pick<HostListing, 'id' | 'version'>; children: (state: FormState) => ReactNode; submitLabel?: string }) {
  const [state, formAction] = useActionState(action, { status: 'idle' } satisfies FormState)
  return (
    <form action={formAction} noValidate className="space-y-5">
      <ErrorSummary state={state} labels={LABELS}>
        {state.details?.latest ? <p className="mt-2 text-sm">Reload the page to see the latest version, then make your change again.</p> : null}
      </ErrorSummary>
      {listing ? (
        <>
          <input type="hidden" name="id" value={listing.id} />
          <input type="hidden" name="version" value={listing.version} />
        </>
      ) : null}
      {children(state)}
      <div className="flex flex-wrap gap-3 border-t border-rule pt-5">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  )
}

/** A value to show: what was just typed (after an error), else what's saved. */
const v = (state: FormState, name: string, saved: string | number | null | undefined) => state.values?.[name] ?? (saved === null || saved === undefined ? '' : String(saved))

export function BasicsForm({ action, listing }: { action: Action; listing?: HostListing }) {
  return (
    <StepForm action={action} listing={listing} submitLabel={listing ? 'Save and continue' : 'Create the draft'}>
      {(state) => (
        <>
          <TextField name="title" label="Title" hint="What makes it special, in a few words: “Bright two-bed by the pool”." maxLength={90} defaultValue={v(state, 'title', listing?.title)} errors={state.fieldErrors?.title} required />
          <TextAreaField name="description" label="Description" hint="What’s it like to stay there? The rooms, the light, the street, the power." rows={6} maxLength={5000} defaultValue={v(state, 'description', listing?.description)} errors={state.fieldErrors?.description} required />
          <SelectField name="propertyType" label="Type of place" defaultValue={v(state, 'propertyType', listing?.propertyType ?? 'apartment')} errors={state.fieldErrors?.propertyType}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
            ))}
          </SelectField>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="bedrooms" label="Bedrooms" hint="0 for a studio" type="number" inputMode="numeric" min={0} max={20} defaultValue={v(state, 'bedrooms', listing?.bedrooms ?? 1)} errors={state.fieldErrors?.bedrooms} />
            <TextField name="bathrooms" label="Bathrooms" type="number" inputMode="numeric" min={1} max={20} defaultValue={v(state, 'bathrooms', listing?.bathrooms ?? 1)} errors={state.fieldErrors?.bathrooms} />
            <TextField name="maxGuests" label="Guests" hint="At most" type="number" inputMode="numeric" min={1} max={30} defaultValue={v(state, 'maxGuests', listing?.maxGuests ?? 2)} errors={state.fieldErrors?.maxGuests} />
          </div>
        </>
      )}
    </StepForm>
  )
}

export function LocationForm({ action, listing }: { action: Action; listing: HostListing }) {
  // The pin and the two number boxes stay in step: drag the pin and the
  // boxes change; type in the boxes and the pin moves. Either way works,
  // so the map is never the only way to set the location.
  const [lat, setLat] = useState(listing.lat !== null ? String(listing.lat) : '')
  const [lng, setLng] = useState(listing.lng !== null ? String(listing.lng) : '')
  return (
    <StepForm action={action} listing={listing}>
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="state" label="State" placeholder="Lagos" defaultValue={v(state, 'state', listing.state)} errors={state.fieldErrors?.state} />
            <TextField name="city" label="City" placeholder="Lagos" defaultValue={v(state, 'city', listing.city)} errors={state.fieldErrors?.city} />
            <TextField name="area" label="Area" hint="Shown to everyone" placeholder="Lekki Phase 1" defaultValue={v(state, 'area', listing.area)} errors={state.fieldErrors?.area} />
          </div>
          <TextField name="addressLine" label="Street address" hint="Private: only guests with a confirmed booking see it." autoComplete="street-address" defaultValue={v(state, 'addressLine', listing.addressLine)} errors={state.fieldErrors?.addressLine} />
          <fieldset>
            <legend className="mb-1.5 font-semibold">The pin</legend>
            <p className="mb-3 text-sm text-muted">Drag the pin to the building, or type the coordinates. Guests only ever see a circle about a kilometre wide until they’ve booked.</p>
            <LocationPicker
              lat={lat}
              lng={lng}
              set={(a, b) => {
                setLat(a.toFixed(6))
                setLng(b.toFixed(6))
              }}
            />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <TextField name="lat" label="Latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} errors={state.fieldErrors?.lat} placeholder="6.4478" />
              <TextField name="lng" label="Longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} errors={state.fieldErrors?.lng} placeholder="3.4723" />
            </div>
          </fieldset>
        </>
      )}
    </StepForm>
  )
}

export function PricingForm({ action, listing }: { action: Action; listing: HostListing }) {
  const money = (kobo: number | null) => (kobo === null ? '' : koboToInput(kobo))
  return (
    <StepForm action={action} listing={listing}>
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <NairaField name="nightly" label="Nightly price" hint="Sunday to Thursday nights" defaultValue={v(state, 'nightly', money(listing.nightlyKobo))} errors={state.fieldErrors?.nightly} />
            <NairaField name="weekend" label="Weekend price" hint="Friday and Saturday nights. Leave empty for the same price." defaultValue={v(state, 'weekend', money(listing.weekendKobo))} errors={state.fieldErrors?.weekend} />
            <NairaField name="cleaningFee" label="Cleaning fee" hint="Once per stay. 0 for none." defaultValue={v(state, 'cleaningFee', money(listing.cleaningFeeKobo))} errors={state.fieldErrors?.cleaningFee} />
            <NairaField name="cautionDeposit" label="Caution deposit" hint="Refundable. Always returned if the guest cancels." defaultValue={v(state, 'cautionDeposit', money(listing.cautionDepositKobo))} errors={state.fieldErrors?.cautionDeposit} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="weeklyDiscountPercent" label="Weekly discount (%)" hint="Off the nights, for 7+ nights" type="number" inputMode="numeric" min={0} max={50} defaultValue={v(state, 'weeklyDiscountPercent', listing.weeklyDiscountPercent)} errors={state.fieldErrors?.weeklyDiscountPercent} />
            <TextField name="minNights" label="Minimum nights" type="number" inputMode="numeric" min={1} max={30} defaultValue={v(state, 'minNights', listing.minNights)} errors={state.fieldErrors?.minNights} />
            <TextField name="maxNights" label="Maximum nights" type="number" inputMode="numeric" min={1} max={90} defaultValue={v(state, 'maxNights', listing.maxNights)} errors={state.fieldErrors?.maxNights} />
          </div>
          <fieldset>
            <legend className="mb-1.5 font-semibold">Cancellation policy</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CANCELLATION_POLICIES.map((p) => (
                <label key={p} className="flex cursor-pointer gap-2.5 rounded-control border border-edge bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-range">
                  <input type="radio" name="cancellationPolicy" value={p} defaultChecked={v(state, 'cancellationPolicy', listing.cancellationPolicy) === p} className="mt-1 size-4 accent-primary" />
                  <span>
                    <span className="block font-semibold">{POLICY_LABELS[p].name}</span>
                    <span className="text-sm text-muted">{POLICY_LABELS[p].summary}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-sm text-muted">Guests also pay a 5% service fee to Staybook. You can set special prices for dates like Detty December on the calendar.</p>
        </>
      )}
    </StepForm>
  )
}

export function RulesForm({ action, listing, amenities }: { action: Action; listing: HostListing; amenities: { code: string; label: string; grp: string }[] }) {
  return (
    <StepForm action={action} listing={listing}>
      {(state) => {
        const chosen = new Set(state.values?.amenities !== undefined ? state.values.amenities.split(',') : listing.amenities)
        return (
          <>
            <div id="amenities">
              <p className="mb-2 font-semibold">Amenities</p>
              <div className="grid gap-5 sm:grid-cols-2">
                {AMENITY_GROUPS.map((grp) => (
                  <fieldset key={grp}>
                    <legend className="rubric mb-1">{AMENITY_GROUP_LABELS[grp]}</legend>
                    {amenities.filter((a) => a.grp === grp).map((a) => (
                      <label key={a.code} className="flex min-h-10 items-center gap-2.5">
                        <input type="checkbox" name="amenity" value={a.code} defaultChecked={chosen.has(a.code)} className="size-5 accent-primary" />
                        {a.label}
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="checkInTime" label="Check-in from" type="time" defaultValue={v(state, 'checkInTime', listing.checkInTime)} errors={state.fieldErrors?.checkInTime} />
              <TextField name="checkOutTime" label="Check-out by" type="time" defaultValue={v(state, 'checkOutTime', listing.checkOutTime)} errors={state.fieldErrors?.checkOutTime} />
            </div>
            <TextAreaField name="houseRules" label="House rules" hint="Parties, smoking, visitors, quiet hours." rows={4} maxLength={2000} defaultValue={v(state, 'houseRules', listing.houseRules)} errors={state.fieldErrors?.houseRules} />
            <TextAreaField name="checkinInstructions" label="Check-in instructions" hint="Private: gate codes, who meets the guest. Only confirmed guests see this." rows={4} maxLength={2000} defaultValue={v(state, 'checkinInstructions', listing.checkinInstructions)} errors={state.fieldErrors?.checkinInstructions} />
          </>
        )
      }}
    </StepForm>
  )
}

/** The last step: send it to the admin. */
export function SubmitForm({ action, listingId, disabled }: { action: Action; listingId: string; disabled: boolean }) {
  const [state, formAction] = useActionState(action, { status: 'idle' } satisfies FormState)
  return (
    <form action={formAction}>
      <ErrorSummary state={state} labels={{}} />
      <input type="hidden" name="id" value={listingId} />
      <SubmitButton variant="large" disabled={disabled} pendingLabel="Sending…" describedBy={disabled ? 'submit-why' : undefined}>
        Send for review
      </SubmitButton>
      {disabled ? <p id="submit-why" className="mt-2 text-sm text-muted">Finish the items above first.</p> : null}
    </form>
  )
}
