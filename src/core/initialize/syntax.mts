import type { EngineState } from '../state/engine.d.ts'
import type { IdentifierSyntax } from '../state/types.mts'
export function setIdentifierSyntax(engine: EngineState) {
  var syntax = (
    engine.Factory as unknown as {
      _identifierSyntax(
        operators: string,
        combinators: string,
      ): IdentifierSyntax
    }
  )._identifierSyntax(engine.CFG.operators, engine.CFG.combinators)
  engine.reOptimizer = new RegExp(syntax.optimizer)
  engine.reValidator = new RegExp(syntax.validator)
  engine.reSimpleId = new RegExp(syntax.simpleId)
  engine.Patterns.id = new RegExp(syntax.id)
  engine.Patterns.tagName = new RegExp(syntax.tagName)
  engine.Patterns.className = new RegExp(syntax.className)
  engine.Patterns.attribute = new RegExp(syntax.attribute)
}
