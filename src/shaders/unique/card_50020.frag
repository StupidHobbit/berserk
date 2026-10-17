#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Харседан: the charging horse throws dust while two lashes travel down
// the blue whip already painted in the illustration. Top-left scan space.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.55, 1.0, length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d = b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
float hash(float n) { return fract(sin(n*127.1+71.7)*43758.5453); }
vec2 whipPoint(float f) {
    return mix(mix(vec2(0.548,0.180),vec2(0.370,0.333),f),
               mix(vec2(0.370,0.333),vec2(0.042,0.413),f),f);
}

void main() {
    vec2 p = vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan = texture2D(u_card,v_uv);
    float aa = max(1.0/max(u_resolution.x,1.0),
                   1.0/max(u_resolution.y,1.0));
    float t = max(u_time,0.0);
    float seed = fract(u_seed*0.173);
    // Stop before the class ribbon and before the first gold stat-frame tips.
    float art = smoothstep(0.139,0.151,p.y)
              * (1.0-smoothstep(0.537,0.549,p.y));
    art *= smoothstep(0.006,0.022,p.x)
         * (1.0-smoothstep(0.978,0.994,p.x));
    // Both ability medallions and the attached '2' are outside the effect.
    art *= clamp(smoothstep(0.169,0.187,p.x)
                + smoothstep(0.302,0.317,p.y),0.0,1.0);
    vec3 color = scan.rgb;
    float luma = dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float face = oval(p,vec2(0.414,0.207),vec2(0.046,0.058));
    float horse = oval(p,vec2(0.666,0.360),vec2(0.261,0.208));
    float mane = oval(p,vec2(0.825,0.305),vec2(0.143,0.164));

    // Two traveling charges per cycle echo the two whip strikes in the rules.
    float cycle = fract(t*0.19+seed*0.22);
    float a = clamp(cycle/0.39,0.0,1.0);
    float b = clamp((cycle-0.46)/0.39,0.0,1.0);
    float pulseA = sin(a*3.14159265);
    float pulseB = sin(b*3.14159265);
    float whip = 0.0;
    float charge = 0.0;
    for (int i=0;i<20;i++) {
        float f = float(i)/20.0;
        float dist = segment(p,whipPoint(f),whipPoint(f+0.05));
        float line = 1.0-smoothstep(0.0009,0.0026+aa,dist);
        float glow = exp(-dist*dist/0.000060);
        float traveling = exp(-pow((f-a)/0.14,2.0))*pulseA
                        + exp(-pow((f-b)/0.14,2.0))*pulseB;
        whip = max(whip,line);
        charge = max(charge,(line*0.65+glow*0.35)*traveling);
    }
    float cyanInk = smoothstep(0.018,0.14,scan.b-scan.r)
                  * smoothstep(0.15,0.55,luma);
    float whipArea = oval(p,vec2(0.291,0.312),vec2(0.310,0.159));
    color += vec3(0.13,0.39,0.51)*charge;
    color += vec3(0.035,0.12,0.18)*whip*(0.45+0.25*sin(t*3.4));
    color += vec3(0.04,0.16,0.21)*cyanInk*whipArea
           * (0.35+0.65*max(pulseA,pulseB));
    float fist = oval(p,vec2(0.538,0.197),vec2(0.027,0.029));
    color += vec3(0.16,0.085,0.018)*fist*(0.3+max(pulseA,pulseB)*0.7);

    // Light runs along the horse's neck and mane as it gathers for a dash.
    float gallop = 0.5+0.5*sin(t*3.3+seed*6.2831853);
    float neckLight = smoothstep(0.035,0.25,luma)
                    * (1.0-smoothstep(0.29,0.57,luma));
    float wind = pow(0.5+0.5*sin(p.x*39.0+p.y*52.0-t*4.8),5.0);
    color += vec3(0.026,0.071,0.087)*neckLight*horse*(0.25+gallop*0.75);
    color += vec3(0.026,0.061,0.080)*mane*wind*neckLight;
    float eye = oval(p,vec2(0.753,0.234),vec2(0.009,0.007));
    color += vec3(0.035,0.21,0.25)*eye*(0.6+0.4*gallop);

    // Hoof-thrown dust streams into the warm empty space behind the mount.
    float dust = 0.0;
    for (int i=0;i<14;i++) {
        float k = float(i);
        float age = fract(t*0.24+k*0.618034+seed);
        vec2 c = vec2(0.34-age*0.31,
                      0.530-age*(0.037+hash(k+3.0)*0.065));
        c.y += sin(age*5.0+k)*0.006;
        vec2 r = vec2(0.006+age*0.014,0.0018+age*0.003);
        float d = length((p-c)/r);
        dust += (1.0-smoothstep(0.35,1.0+aa/r.x,d))
               * sin(age*3.14159265)*0.55;
    }
    float background = 1.0-smoothstep(0.29,0.39,p.x);
    color += vec3(0.27,0.15,0.066)*dust*background;

    if (u_is_foil) {
        // Broad interference bands remain visible on the black coat at t=0.
        // The horse, whip and bronze harness share an embossed metallic finish.
        float bronze = smoothstep(0.04,0.22,scan.r-scan.b)
                     * smoothstep(0.15,0.50,luma);
        float finish = (0.34+0.46*horse+0.18*bronze)*(1.0-face*0.85);
        float phase = p.x*1.65+p.y*2.15+t*0.12+seed*0.4
                    + 0.10*sin(p.x*12.0-p.y*17.0);
        vec3 spectrum = 0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        vec3 coated = mix(2.0*color*spectrum,
                          1.0-2.0*(1.0-color)*(1.0-spectrum),
                          step(vec3(0.5),color));
        color = mix(color,coated,finish*0.55);
        float sheen = pow(0.5+0.5*sin(p.x*14.0-p.y*9.0-t*1.4),7.0);
        color += (1.0-color)*(vec3(0.035)+spectrum*0.19)*finish;
        color += (1.0-color)*mix(vec3(0.90,0.78,0.53),spectrum,0.55)
               * sheen*finish*(0.23+0.22*neckLight);
        color += vec3(0.10,0.17,0.20)*whip*(0.4+0.6*sheen);
    }
    gl_FragColor = vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
