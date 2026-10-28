package test

import (
	"os"
	"reflect"
	"testing"

	"live-coding-duplicates/solution"
	"live-coding-duplicates/src"
)

func chooseDuplicates() func([]int) []int {
	if os.Getenv("SOLUTION") == "" {
		return src.Duplicates
	}

	return solution.Duplicates
}

func TestDuplicates(t *testing.T) {
	duplicates := chooseDuplicates()
	tests := []struct {
		name    string
		numbers []int
		want    []int
	}{
		{"example from the problem", []int{1, 2, 2, 3, 3, 3}, []int{2, 3}},
		{"edge case: empty list", []int{}, []int{}},
		{"edge case: no repeated numbers", []int{1, 2, 3}, []int{}},
		{"keeps the order of first appearance", []int{5, 1, 5, 1, 2}, []int{5, 1}},
		{"works with negative numbers", []int{-1, -1, 0}, []int{-1}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := duplicates(test.numbers)

			if !reflect.DeepEqual(got, test.want) {
				t.Errorf("Duplicates(%#v) = %#v, want %#v", test.numbers, got, test.want)
			}
		})
	}
}
