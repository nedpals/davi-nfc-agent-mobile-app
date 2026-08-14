import ExpoModulesCore

public class AgentPinningModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AgentPinning")

    Property("isSupported") { true }

    Function("setPin") { (pin: String?) in
      AgentPinning.setPin(pin)
    }
  }
}
