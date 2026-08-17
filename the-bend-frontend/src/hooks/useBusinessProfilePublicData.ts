import { useCallback, useEffect, useState, type SetStateAction } from 'react'
import { discountCodeApi } from '@/services/discountCodeApi'
import { shopApi } from '@/services/shopApi'
import type { DiscountCode, Listing, Shop } from '@/types'
import { useCachedPublicContent } from './useCachedPublicContent'

export type PublicEndorsement = {
  id: string
  message: string | null
  created_at: string
  endorser: {
    id: string
    name: string
    business_type: string
    avatar_url: string | null
    kind: 'business' | 'individual'
  }
}

export function useBusinessProfilePublicData(shopId: string | undefined) {
  const cached = useCachedPublicContent<Shop>(
    `business:${shopId ?? ''}`,
    useCallback(async () => (await shopApi.getShop(shopId!)).data, [shopId]),
  )
  const [related, setRelated] = useState<{
    shopId: string | undefined
    listings: Listing[]
    endorsements: PublicEndorsement[]
    endorsementCount: number
    discountCodes: DiscountCode[]
    loading: boolean
    error: boolean
  }>({ shopId, listings: [], endorsements: [], endorsementCount: 0, discountCodes: [], loading: !!shopId, error: false })

  useEffect(() => {
    let active = true
    if (!shopId) return () => { active = false }

    void Promise.all([
      shopApi.getShopListings(shopId),
      shopApi.getEndorsements(shopId),
      discountCodeApi.listForShop(shopId).catch(() => ({ data: [] as DiscountCode[] })),
    ]).then(([listingsResponse, endorsementsResponse, discountsResponse]) => {
      if (!active) return
      setRelated({
        shopId,
        listings: listingsResponse.data.items ?? listingsResponse.data ?? [],
        endorsements: endorsementsResponse.data.items ?? [],
        endorsementCount: endorsementsResponse.data.count ?? 0,
        discountCodes: Array.isArray(discountsResponse.data) ? discountsResponse.data : [],
        loading: false,
        error: false,
      })
    }).catch(() => {
      if (active) setRelated({ shopId, listings: [], endorsements: [], endorsementCount: 0, discountCodes: [], loading: false, error: true })
    })

    return () => { active = false }
  }, [shopId])

  const visibleRelated = related.shopId === shopId
    ? related
    : { shopId, listings: [] as Listing[], endorsements: [] as PublicEndorsement[], endorsementCount: 0, discountCodes: [] as DiscountCode[], loading: !!shopId, error: false }
  const setEndorsements = useCallback((next: SetStateAction<PublicEndorsement[]>) => {
    setRelated((current) => current.shopId !== shopId ? current : {
      ...current,
      endorsements: typeof next === 'function' ? next(current.endorsements) : next,
    })
  }, [shopId])
  const setEndorsementCount = useCallback((next: SetStateAction<number>) => {
    setRelated((current) => current.shopId !== shopId ? current : {
      ...current,
      endorsementCount: typeof next === 'function' ? next(current.endorsementCount) : next,
    })
  }, [shopId])
  const shopData = cached.data && cached.data.id === shopId ? cached.data : null
  return {
    cached,
    shopData,
    listings: visibleRelated.listings,
    endorsements: visibleRelated.endorsements,
    setEndorsements,
    endorsementCount: visibleRelated.endorsementCount,
    setEndorsementCount,
    discountCodes: visibleRelated.discountCodes,
    relatedLoading: visibleRelated.loading,
    relatedError: visibleRelated.error,
  }
}
