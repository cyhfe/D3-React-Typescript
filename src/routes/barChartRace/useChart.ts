import * as d3 from "d3";
import { useCallback, useEffect } from "react";
interface Data {
  date: Date;
  name: string;
  category: string;
  value: number;
}

type Dataset = Data[];

interface Rank {
  rank: number;
  name: string;
  value: number;
}

type Keyframe = [Date, Rank[]];
type Keyframes = Keyframe[];

function useChart(
  dataset: Dataset | null,
  innerChartRef: React.MutableRefObject<SVGGElement | null>,
  innerHeight: number,
  innerWidth: number
) {
  const createChart = useCallback(
    function createChart() {
      if (!innerChartRef.current) return () => void 0;
      console.log("create");
      const root = d3
        .select(innerChartRef.current)
        .append("g")
        .attr("class", "root");
      root.append("g").attr("class", "bars").attr("fill-opacity", 0.6);
      root.append("g").attr("class", "axis");
      root.append("g").attr("class", "labels");
      root.append("g").attr("class", "ticker");
      root
        .append("line")
        .attr("class", "sider")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#f0f0f0");
      root
        .append("text")
        .attr("class", "year")
        .style("fill", "#434343")
        .attr("text-anchor", "end")
        .attr("x", innerWidth - 6)
        .attr("y", innerHeight - 6)
        .attr("dy", "0.32em");

      root
        .append("g")
        .attr("class", "year")
        .style("font", "bold 12px var(--sans-serif)")
        .style("font-variant-numeric", "tabular-nums")
        .attr("text-anchor", "end")
        .selectAll("text");

      root.append("g").attr("class", "info").append("text").append("tspan");

      return () => {
        console.log("remove");
        root.remove();
      };
    },
    [innerChartRef, innerHeight, innerWidth]
  );

  const updateChart = useCallback(
    async function updateChart() {
      if (!innerChartRef.current || !dataset) return;
      console.log("update");

      const n = 12; // bars 数量
      const duration = 200;

      const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]); //value
      const yDomain = Array.from(d3.range(n), (n) => String(n));
      const y = d3
        .scaleBand()
        .domain(yDomain)
        .range([0, innerHeight])
        .padding(0.1); //rank

      const names = new Set(dataset.map((d) => d.name));
      const catagorys = new Set(dataset.map((d) => d.category));

      const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(catagorys);

      const getColorByName = (name: string) =>
        colorScale(dataset.find((d) => d.name === name)?.category || "");

      // console.log(dataset);

      // rollup返回嵌套的map
      // {
      //   date => {
      //     name => value
      //     ...
      //   }
      //   ...
      // }

      // 转化为数组
      //
      // [
      //   [ date, name => value ],
      //   ...
      // ]

      const datevalues: [Date, d3.InternMap<string, number>][] = Array.from(
        d3.rollup(
          dataset,
          ([d]) => d.value,
          (d) => +d.date,
          (d) => d.name
        )
      ).map(([date, data]) => {
        return [new Date(date), data];
      });

      datevalues.sort(([d1], [d2]) => d3.ascending(d1, d2));

      // datevalues
      // [
      //   [date, Map(name => value ...)]
      //   ...
      // ]

      function rank(getValueByName: (name: string) => number): Rank[] {
        const data = Array.from(names, (name) => ({
          name,
          value: getValueByName(name),
        }));
        data.sort((a, b) => d3.descending(a.value, b.value));
        const dataWithRank = data.map((d, i) => ({ ...d, rank: i }));
        return dataWithRank;
      }

      // 我们需要时间对应排名的 date => rank[]
      // 由于排名每年变化一次,20 年才生成 20 个过渡动画,所以我们要对每两年的数据进行线性插值(k代表插值数)
      function getKeyframes(
        datevalues: [Date, d3.InternMap<string, number>][]
      ): Keyframes {
        const k = 10;
        const keyframes: Keyframes = [];
        for (const pairs of d3.pairs(datevalues)) {
          const [[ka, a], [kb, b]] = pairs;
          for (let i = 0; i < k; i++) {
            const t = i / k;

            keyframes.push([
              new Date((+kb - +ka) * t + +ka),
              rank(
                (name) =>
                  ((b.get(name) || 0) - (a.get(name) || 0)) * t +
                  (a.get(name) || 0)
              ),
            ]);
          }
        }
        const lastValue = datevalues[datevalues.length - 1];
        keyframes.push([
          new Date(lastValue[0]),
          rank((name) => lastValue[1].get(name) || 0),
        ]);

        return keyframes;
      }
      const keyframes = getKeyframes(datevalues);
      // console.log(keyframes.slice(0, 10));

      // enter => .attr("y", d => y((prev.get(d) || d).rank))
      //          .attr("width", d => x((prev.get(d) || d).value) - x(0)),

      // exit => exit.transition(transition).remove()
      // .attr("y", d => y((next.get(d) || d).rank))
      // .attr("width", d => x((next.get(d) || d).value) - x(0))

      // 过渡效果:
      // 进入时,移动到前一个时间点的位置
      // 退出时,移动到下一个时间点的位置
      // 进入和更新合并更新当前位置
      const flatKeyframesWithoutDate = keyframes.map(([, data]) => data).flat();

      // 得到 name => rank[](按时间排序)
      const nameFrames = d3.group(flatKeyframesWithoutDate, (v) => v.name);

      //   [string, {
      //     rank: number;
      //     name: string;
      //     value: number;
      //   }[]][]

      const nameFramesArray = Array.from(nameFrames);

      // [
      //   [
      //     // 按名字排序
      //     [
      //       // 按时间排序
      //       Rank1,
      //       Rank2
      //     ],
      //   ],
      //   ...
      // ]
      const mapNameFramesArray = nameFramesArray.map(([, data]) => {
        // [
        //   // 按名字排序
        //   [
        //     // 按时间排序
        //     Rank1,
        //     Rank2
        //   ],
        // ]
        const pairs = d3.pairs(data, (a, b) => [b, a]) as [Rank, Rank][];
        return pairs;
      });

      // [
      //   [ Rank1,Rank2,]
      //   [ Rank1,Rank2,]
      //   [ Rank1,Rank2,]
      // ]
      const flatMapNameFramesArray = mapNameFramesArray.flat();

      const prev = new Map(flatMapNameFramesArray);
      const next = new Map(
        nameFramesArray.flatMap(([, data]) => d3.pairs(data))
      );

      // const bars:  = d3
      //   .select(innerChartRef.current)
      //   .append("g")
      //   .attr("class", "barGroups")
      //   .attr("fill-opacity", 0.6) as d3.Selection<
      //   d3.BaseType,
      //   Rank,
      //   SVGGElement,
      //   unknown
      // >

      // barsGroup.attr("fill-opacity", 0.6);

      function updateBars(
        [, ranks]: Keyframe,
        transition: d3.Transition<d3.BaseType, unknown, null, undefined>
      ) {
        const barsGroup = d3
          .select(innerChartRef.current)
          .select(".root .bars") as d3.Selection<
          SVGGElement,
          unknown,
          null,
          undefined
        >;

        const dataRanks = ranks.slice(0, n);

        const bars = barsGroup.selectAll("rect") as d3.Selection<
          d3.BaseType,
          Rank,
          SVGGElement,
          unknown
        >;

        bars
          .data(dataRanks, (d) => d.name)
          .join(
            (enter) =>
              enter
                .append("rect")
                .attr("height", y.bandwidth())
                .attr("x", x(0))
                .attr("y", (d) => {
                  const rank = String((prev.get(d) || d).rank);
                  return y(rank) || innerHeight + y.bandwidth();
                })
                .attr("width", (d) => x((prev.get(d) || d).value) - x(0)),
            (update) => update,
            (exit) => {
              exit
                .transition(transition)
                .remove()
                .attr("y", (d) => {
                  return (
                    y(String((next.get(d) || d).rank)) ||
                    innerHeight + y.bandwidth()
                  );
                })
                .attr("width", (d) => x((next.get(d) || d).value) - x(0));

              return exit;
            }
          )
          .call((bars) => {
            bars
              .attr("fill", (d) => getColorByName(d.name))
              .transition(transition)
              .attr("y", (d) => y(String(d.rank)) || innerHeight)
              .attr("width", (d) => x(d.value) - x(0));
            return bars;
          });
        return bars;
      }

      function updateAxis(
        transition: d3.Transition<d3.BaseType, unknown, null, undefined>
      ) {
        const axis = d3
          .select(innerChartRef.current)
          .select(".root .axis") as d3.Selection<
          SVGGElement,
          unknown,
          null,
          undefined
        >;

        const axisGenerator = d3
          .axisTop(x)
          .ticks(innerWidth / 160)
          .tickSizeOuter(0)
          .tickSizeInner(-innerHeight);

        axis.transition(transition).call(axisGenerator);
        axis.select(".tick:first-of-type text").remove();
        axis.selectAll(".tick line").attr("stroke", "white");
        axis.selectAll(".tick text").style("font-size", "6px");
        axis.select(".domain").remove();
      }

      function updateYear(
        [date]: Keyframe,
        transition: d3.Transition<d3.BaseType, unknown, null, undefined>
      ) {
        d3.select(innerChartRef.current)
          .select(".root .year")
          .transition(transition)
          .text(d3.timeFormat("%Y %b")(date));
      }

      // function updateInfo(
      //   [date, ranks]: Keyframe,
      //   transition: d3.Transition<d3.BaseType, unknown, null, undefined>
      // ) {
      //   const dataRanks = ranks.slice(0, n);

      //   const infoGroups = d3
      //     .select(innerChartRef.current)
      //     .select(".root")
      //     .selectAll(".info") as d3.Selection<
      //     d3.BaseType,
      //     unknown,
      //     SVGGElement,
      //     unknown
      //   >;

      //   const infos = infoGroups.selectAll("g") as d3.Selection<
      //     d3.BaseType,
      //     Rank,
      //     SVGGElement,
      //     unknown
      //   >;

      //   infos
      //     .data(dataRanks, (d) => d.name)
      //     .join(
      //       (enter) =>
      //         enter
      //           .append("g")
      //           .attr("paading", 2)
      //           .call((enter) => {
      //             enter
      //               .append("text")
      //               .attr("alignment-baseline", "mathematical")
      //               .attr("text-anchor", "end")
      //               .style("font-size", 8)
      //               .text((d) => d.value)
      //               .append("tspan")
      //               .style("font-size", 12)
      //               .attr("alignment-baseline", "central")
      //               .attr("text-anchor", "end")
      //               .text((d) => d.name);
      //           }),
      //       (update) => update,
      //       (exit) => exit.remove()
      //     )
      //     .call((infos) =>
      //       infos
      //         .append("g")
      //         .attr("paading", 2)
      //         .call((enter) => {
      //           enter
      //             .append("text")
      //             .attr("alignment-baseline", "mathematical")
      //             .attr("text-anchor", "end")
      //             .style("font-size", 8)
      //             .text((d) => d.value)
      //             .append("tspan")
      //             .style("font-size", 12)
      //             .attr("alignment-baseline", "central")
      //             .attr("text-anchor", "end")
      //             .text((d) => d.name);
      //         })

      //         .transition(transition)
      //         .attr(
      //           "transform",
      //           (d) =>
      //             `translate(${x(d.value) - 4}, ${
      //               (y(String(d.rank)) || innerHeight) + y.bandwidth() / 2
      //             })`
      //         )
      //     );
      // }

      for (const keyframe of keyframes) {
        const transition = d3
          .transition()
          .duration(duration)
          .ease(d3.easeLinear);

        // Extract the top bar’s value.
        x.domain([0, keyframe[1][0].value]);
        updateBars(keyframe, transition);
        updateAxis(transition);
        updateYear(keyframe, transition);
        // updateInfo(keyframe, transition);
        await transition.end();
      }
    },
    [dataset, innerChartRef, innerHeight, innerWidth]
  );

  useEffect(() => {
    const destory = createChart();
    return () => {
      destory();
    };
  }, [createChart]);

  return {
    createChart,
    updateChart,
  };
}

export default useChart;
