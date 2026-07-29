package ports

import "context"

type ReadinessChecker interface {
	Ready(context.Context) error
}
