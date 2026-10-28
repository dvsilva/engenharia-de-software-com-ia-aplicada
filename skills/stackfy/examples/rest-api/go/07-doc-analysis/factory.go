package main

func buildDocumentQAGraphInstance() Graph {
	return buildDocumentQAGraph(NewOpenRouterService(loadConfig()))
}
