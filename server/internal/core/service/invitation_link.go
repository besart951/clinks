package service

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

type invitationLinkBuilder struct {
	baseURL url.URL
}

func newInvitationLinkBuilder(
	rawBaseURL string,
) (invitationLinkBuilder, error) {
	rawBaseURL = strings.TrimSpace(rawBaseURL)

	parsed, err := url.Parse(rawBaseURL)
	if err != nil {
		return invitationLinkBuilder{},
			fmt.Errorf(
				"parse invitation base URL: %w",
				err,
			)
	}

	if parsed.Scheme != "http" &&
		parsed.Scheme != "https" {
		return invitationLinkBuilder{},
			errors.New(
				"invitation base URL must use http or https",
			)
	}

	if parsed.Host == "" {
		return invitationLinkBuilder{},
			errors.New(
				"invitation base URL must be absolute",
			)
	}

	if parsed.User != nil {
		return invitationLinkBuilder{},
			errors.New(
				"invitation base URL must not contain user information",
			)
	}

	if parsed.RawQuery != "" {
		return invitationLinkBuilder{},
			errors.New(
				"invitation base URL must not contain query parameters",
			)
	}

	if parsed.Fragment != "" {
		return invitationLinkBuilder{},
			errors.New(
				"invitation base URL must not contain a fragment",
			)
	}

	parsed.Path = strings.TrimRight(
		parsed.Path,
		"/",
	)

	return invitationLinkBuilder{
		baseURL: *parsed,
	}, nil
}

func (builder invitationLinkBuilder) URL(
	token string,
) string {
	target := builder.baseURL

	target.Path = strings.TrimRight(
		target.Path,
		"/",
	) + "/invite"

	query := target.Query()
	query.Set("token", token)
	target.RawQuery = query.Encode()

	return target.String()
}
