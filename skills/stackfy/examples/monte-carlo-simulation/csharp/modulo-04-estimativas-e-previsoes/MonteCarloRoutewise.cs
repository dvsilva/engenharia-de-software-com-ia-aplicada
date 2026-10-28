using System.Text;
using static System.FormattableString;

const double HardwareWeek = 9;
const int Simulations = 10_000;

var stories = new Dictionary<string, Estimate>
{
    ["US-01 Alertas de Velocidade"] = new(2, 3, 5),
    ["US-03 Score de Comportamento"] = new(3, 4, 6),
    ["US-04 Sensor de Abertura de Bau"] = new(1, 2, 3),
    ["US-09 Carga Refrigerada"] = new(2, 3, 5),
};
var totals = Enumerable.Range(0, Simulations).Select(_ => SimulateProject()).Order().ToArray();
var mean = totals.Average();
var rule = new string('=', 50);

Console.OutputEncoding = Encoding.UTF8;

Console.WriteLine(rule);
Console.WriteLine(Invariant($"Monte Carlo RouteWise — {Simulations:N0} simulacoes"));
Console.WriteLine(rule);
Console.WriteLine(Invariant($"P50 (cenario provavel):        {Percentile(50):F1} semanas"));
Console.WriteLine(Invariant($"P85 (compromisso com cliente): {Percentile(85):F1} semanas"));
Console.WriteLine(Invariant($"P95 (conservador):             {Percentile(95):F1} semanas"));
Console.WriteLine(Invariant($"Media:                         {mean:F1} semanas"));
Console.WriteLine(rule);

double Triangular(Estimate estimate)
{
    var (optimistic, mostLikely, pessimistic) = estimate;
    var draw = Random.Shared.NextDouble();
    var modeShare = (mostLikely - optimistic) / (pessimistic - optimistic);

    if (draw < modeShare)
        return optimistic + Math.Sqrt(draw * (pessimistic - optimistic) * (mostLikely - optimistic));

    return pessimistic - Math.Sqrt((1 - draw) * (pessimistic - optimistic) * (pessimistic - mostLikely));
}

double SimulateProject()
{
    var softwareTrack =
        (Triangular(stories["US-01 Alertas de Velocidade"]) + Triangular(stories["US-03 Score de Comportamento"])) / 1.3;
    var hardwareTrack = HardwareWeek
        + (Triangular(stories["US-04 Sensor de Abertura de Bau"]) + Triangular(stories["US-09 Carga Refrigerada"])) / 1.5;

    return Math.Max(softwareTrack, hardwareTrack);
}

double Percentile(int percent) => totals[percent * Simulations / 100];

record Estimate(double Optimistic, double MostLikely, double Pessimistic);
