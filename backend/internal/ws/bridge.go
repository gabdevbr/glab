package ws

// BridgeNotifier receives outbound events from the ws hub to forward to external systems.
// Implemented by rcbridge.Bridge; defined here to avoid circular imports.
type BridgeNotifier interface {
	Notify(channelID, userID string, env Envelope)
}
