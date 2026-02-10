import ky from "npm:ky@1.14.3";

await ky.get("https://google.com").text();
