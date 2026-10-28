package src

func createQueryPlannerNode() node {
	return func(state GraphState) GraphState {
		return state
	}
}
