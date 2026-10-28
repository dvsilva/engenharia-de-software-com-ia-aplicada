package solution

// Duplicates returns the numbers that appear more than once, in order of first appearance.
func Duplicates(numbers []int) []int {
	counts := map[int]int{}
	firstSeen := []int{}

	for _, number := range numbers {
		if counts[number] == 0 {
			firstSeen = append(firstSeen, number)
		}
		counts[number]++
	}

	repeated := []int{}

	for _, number := range firstSeen {
		if counts[number] > 1 {
			repeated = append(repeated, number)
		}
	}

	return repeated
}
