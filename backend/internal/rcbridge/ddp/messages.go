// Package ddp implements a minimal Meteor DDP (Distributed Data Protocol)
// client for RocketChat integration.
package ddp

// Outbound message types
const (
	MsgConnect = "connect"
	MsgMethod  = "method"
	MsgSub     = "sub"
	MsgUnsub   = "unsub"
	MsgPong    = "pong"
	MsgPing    = "ping"
)

// Inbound message types
const (
	MsgConnected = "connected"
	MsgFailed    = "failed"
	MsgResult    = "result"
	MsgUpdated   = "updated"
	MsgReady     = "ready"
	MsgAdded     = "added"
	MsgChanged   = "changed"
	MsgRemoved   = "removed"
	MsgError     = "error"
)

// Connect is sent to initiate a DDP connection.
type Connect struct {
	Msg     string   `json:"msg"`
	Version string   `json:"version"`
	Support []string `json:"support"`
}

// Method calls a server method.
type Method struct {
	Msg    string `json:"msg"`
	ID     string `json:"id"`
	Method string `json:"method"`
	Params []any  `json:"params"`
}

// Sub subscribes to a publication.
type Sub struct {
	Msg    string `json:"msg"`
	ID     string `json:"id"`
	Name   string `json:"name"`
	Params []any  `json:"params"`
}

// Unsub cancels a subscription.
type Unsub struct {
	Msg string `json:"msg"`
	ID  string `json:"id"`
}

// Ping sends a keepalive.
type Ping struct {
	Msg string `json:"msg"`
}

// Pong replies to a ping.
type Pong struct {
	Msg string `json:"msg"`
}

// Incoming is the base structure of all server-sent messages.
type Incoming struct {
	Msg        string          `json:"msg"`
	Session    string          `json:"session,omitempty"`
	ID         string          `json:"id,omitempty"`
	Collection string          `json:"collection,omitempty"`
	Subs       []string        `json:"subs,omitempty"`
	Error      *RemoteError    `json:"error,omitempty"`
	Result     any             `json:"result,omitempty"`
	Fields     map[string]any  `json:"fields,omitempty"`
}

// RemoteError is a server-reported error.
type RemoteError struct {
	Error       any    `json:"error"`
	Reason      string `json:"reason"`
	Message     string `json:"message"`
	ErrorType   string `json:"errorType"`
}

func (e *RemoteError) GoError() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Reason != "" {
		return e.Reason
	}
	return "remote DDP error"
}

// LoginParams is used for authentication via resume token.
type LoginParams struct {
	Resume string `json:"resume"`
}

// LoginPasswordParams is used for username+password auth.
type LoginPasswordParams struct {
	User     map[string]string `json:"user"`
	Password map[string]string `json:"password"`
}

// LoginResult is the server response to a login method call.
type LoginResult struct {
	ID    string `json:"id"`
	Token string `json:"token"`
}
