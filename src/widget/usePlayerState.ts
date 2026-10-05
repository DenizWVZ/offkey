import { useSyncExternalStore } from 'react'
import type { Player, PlayerState } from '../audio/player'

// Redraws the component whenever the player's state changes.
export function usePlayerState(player: Player): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState)
}
