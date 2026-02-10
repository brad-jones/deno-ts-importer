import { RawHcl, Resource, Stack, Terraform } from "jsr:@brad-jones/cdkts@0.4.1/constructs";

export default class MyStack extends Stack<typeof MyStack> {
  constructor() {
    super(`${import.meta.url}#${MyStack.name}`);

    new Terraform(this, {
      requiredVersion: ">=1,<2.0",
      requiredProviders: {
        local: {
          source: "hashicorp/local",
          version: "2.6.1",
        },
      },
    });

    new Resource(this, "local_file", "hello", {
      filename: new RawHcl('"${path.module}/message.txt"'),
      content: "Hello World",
    });
  }
}
