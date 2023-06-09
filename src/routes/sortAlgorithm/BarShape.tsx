import * as d3 from "d3";
import { useCallback, useEffect, useRef } from "react";
import { color } from "../../color";
interface BarShapeProps {
  data: number[];
  innerHeight: number;
  yScale: d3.ScaleLinear<number, number, never>;
  xScale: d3.ScaleBand<string>;
}
function BarShape({ data, innerHeight, xScale, yScale }: BarShapeProps) {
  const barGroup = useRef<SVGGElement | null>(null);

  const draw = useCallback(
    function draw() {
      const exitTransition = d3.transition().duration(600);

      const updateTransition = exitTransition.transition().duration(600);

      const enterTransition = updateTransition.transition().duration(600);

      const mergeTransition = enterTransition.transition().duration(200);

      const rects = d3.select(barGroup.current).selectAll("rect");
      console.log(rects);

      rects
        .data(data, (d) => d as number)
        .join(
          (enter) =>
            enter
              .append("rect")
              .attr("x", (_, i) => xScale(String(i)) as number)
              .attr("y", innerHeight)
              .attr("width", xScale.bandwidth())
              .attr("height", 0)
              .attr("fill", color.enter)
              .call((enter) =>
                enter
                  .transition(enterTransition)
                  .attr("y", (d) => yScale(d))
                  .attr("height", (d) => innerHeight - yScale(d))
              ),
          (update) => {
            return update
              .attr("y", (d) => yScale(d))
              .attr("height", (d) => innerHeight - yScale(d))
              .call((update) =>
                update
                  .attr("fill", color.update)
                  .transition(updateTransition)
                  .attr("x", (_, i) => xScale(String(i)) as number)
              );
          },
          (exit) => {
            return exit.call((exit) =>
              exit
                .transition(exitTransition)
                .attr("y", innerHeight)
                .attr("height", 0)
                .attr("fill", color.exit)
                .remove()
            );
          }
        )
        .transition(mergeTransition)
        .attr("fill", color.enter);
    },
    [data, innerHeight, xScale, yScale]
  );

  useEffect(() => {
    draw();
  }, [data, draw, innerHeight, xScale, yScale]);
  return (
    <g className="bar-shape" ref={barGroup}>
      {/* {data.map((n, i) => {
        return (
          <rect
            key={n + "-" + i}
            x={xScale(String(i))}
            y={yScale(n)}
            width={xScale.bandwidth()}
            height={innerHeight - yScale(n)}
          />
        )
      })} */}
    </g>
  );
}

export default BarShape;
