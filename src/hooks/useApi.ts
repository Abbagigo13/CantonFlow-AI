import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgreementAction, type EditInput, type NewAgreementInput, type Status } from '@/lib/api'

export function useAgreements(search: string, status: Status | 'Expired' | 'All') {
  return useQuery({
    queryKey: ['agreements', search, status],
    queryFn: () => api.agreements({ search, status }),
    placeholderData: keepPreviousData,
  })
}

export function useAgreement(id: string | null) {
  return useQuery({
    queryKey: ['agreement', id],
    queryFn: () => api.agreement(id as string),
    enabled: id !== null,
  })
}

export function useMetrics() {
  return useQuery({ queryKey: ['metrics'], queryFn: api.metrics })
}

export function useSystemStatus() {
  return useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 15_000 })
}

export function useCreateAgreement() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewAgreementInput) => api.createAgreement(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['agreements'] })
      void client.invalidateQueries({ queryKey: ['metrics'] })
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useAgreementAction(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (action: AgreementAction) => api.act(id, action),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['agreement', id] })
      void client.invalidateQueries({ queryKey: ['agreements'] })
      void client.invalidateQueries({ queryKey: ['metrics'] })
      void client.invalidateQueries({ queryKey: ['status'] })
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: ['activity'] })
      void client.invalidateQueries({ queryKey: ['timeline'] })
    },
  })
}

export function useVerifyAgreement(id: string) {
  return useMutation({ mutationFn: () => api.verify(id) })
}

export function useReviewAgreement(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ evidence, evidenceIds }: { evidence: string; evidenceIds: string[] }) => api.review(id, evidence, evidenceIds),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['agreement', id] }),
  })
}

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: ['me'], queryFn: api.me, enabled, retry: false })
}

export function useMembers(key: string | undefined) {
  return useQuery({ queryKey: ['members', key], queryFn: () => api.members(key as string), enabled: Boolean(key) })
}

export function useCreateOrganization() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createOrganization(name),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useAddMember(key: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (address: string) => api.addMember(key, address),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['members', key] }),
  })
}

export function useRemoveMember(key: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (address: string) => api.removeMember(key, address),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['members', key] }),
  })
}

export function useInbox() {
  return useQuery({ queryKey: ['inbox'], queryFn: api.inbox, refetchInterval: 20_000 })
}

export function useActivity(limit = 12) {
  return useQuery({ queryKey: ['activity', limit], queryFn: () => api.activity(limit), refetchInterval: 30_000 })
}

export function useUploadEvidence(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadEvidence(id, file),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['agreement', id] })
      void client.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useRemoveEvidence(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (evidenceId: string) => api.removeEvidence(evidenceId),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['agreement', id] })
      void client.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useEditAgreement(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: EditInput) => api.edit(id, patch),
    onSettled: () => {
      for (const key of ['agreement', 'agreements', 'metrics', 'inbox', 'activity', 'timeline']) void client.invalidateQueries({ queryKey: [key] })
    },
  })
}

export function useCancelAgreement(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.cancel(id),
    onSettled: () => {
      for (const key of ['agreement', 'agreements', 'metrics', 'inbox', 'activity', 'timeline']) void client.invalidateQueries({ queryKey: [key] })
    },
  })
}

export function useCreateInvite(id: string) {
  return useMutation({ mutationFn: () => api.createInvite(id) })
}

export function usePreviewInvite(token: string) {
  return useQuery({ queryKey: ['invite', token], queryFn: () => api.previewInvite(token), enabled: token.length > 0, retry: false })
}

export function useAcceptInvite() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => api.acceptInvite(token),
    onSettled: () => {
      for (const key of ['me', 'agreements', 'inbox', 'activity', 'metrics']) void client.invalidateQueries({ queryKey: [key] })
    },
  })
}

export function useTimeline(days: number) {
  return useQuery({ queryKey: ['timeline', days], queryFn: () => api.timeline(days), refetchInterval: 60_000 })
}
