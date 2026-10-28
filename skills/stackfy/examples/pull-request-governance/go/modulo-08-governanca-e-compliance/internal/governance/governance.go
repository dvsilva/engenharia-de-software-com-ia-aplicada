package governance

import (
	"regexp"
	"slices"
	"strings"
)

type Config struct {
	JiraPrefix            string
	CriticalPaths         []string
	CriticalApprovers     int
	LargePRThreshold      int
	CoverageDropThreshold float64
}

type Review struct {
	State string `json:"state"`
}

var RouteWise = Config{
	JiraPrefix: "ROUTEWISE",
	CriticalPaths: []string{
		"src/integrations/gps",
		"src/services/notifications",
		"src/api/routes",
		"migrations/",
		".env",
		"docker-compose",
	},
	CriticalApprovers:     2,
	LargePRThreshold:      500,
	CoverageDropThreshold: 5,
}

func (config Config) ReferencesCard(texts ...string) bool {
	card := regexp.MustCompile(`(?i)` + regexp.QuoteMeta(config.JiraPrefix) + `-\d+`)

	return slices.ContainsFunc(texts, card.MatchString)
}

func (config Config) CriticalFiles(files []string) []string {
	isCritical := func(file string) bool {
		return slices.ContainsFunc(config.CriticalPaths, func(path string) bool {
			return strings.Contains(file, path)
		})
	}

	return slices.DeleteFunc(slices.Clone(files), func(file string) bool {
		return !isCritical(file)
	})
}

func CountApprovals(reviews []Review) int {
	approvals := 0
	for _, review := range reviews {
		if review.State == "APPROVED" {
			approvals++
		}
	}

	return approvals
}

func TextOrEmpty(text *string) string {
	if text == nil {
		return ""
	}

	return *text
}
