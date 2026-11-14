import { httpClient } from './httpClient.ts'
import { mockClient } from './mockClient.ts'
import type { AssistantClient } from './types.ts'

export type * from './types.ts'

const url = import.meta.env.VITE_ASSISTANT_URL as string | undefined

/** The backend when VITE_ASSISTANT_URL is set (falling back to the mock), the mock otherwise. */
export const assistant: AssistantClient = url ? httpClient(url, mockClient) : mockClient
export const assistantIsMock = !url
