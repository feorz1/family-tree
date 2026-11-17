import React from "react";
import {AnimateUIProvider} from "@animate-ui/react/provider";
import {ReducedMotionConfig} from "@animate-ui/react/utils/motion";

export function FamilyAnimation({children}) {
  return <AnimateUIProvider tempo={0.8}>
    <ReducedMotionConfig>{children}</ReducedMotionConfig>
  </AnimateUIProvider>;
}
