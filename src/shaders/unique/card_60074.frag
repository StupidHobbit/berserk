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

// Фенке: five charges lodge in the mace; the fifth wakes the poison
// of his undead second phase. Anchors are on the BASE 496 x 700 scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float lineDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab=b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
}
vec2 chargePoint(float k) {
    if(k<0.5) return vec2(0.747,0.432);
    if(k<1.5) return vec2(0.810,0.365);
    if(k<2.5) return vec2(0.883,0.350);
    if(k<3.5) return vec2(0.932,0.402);
    return vec2(0.936,0.474);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    float art=smoothstep(0.140,0.152,p.y)*(1.0-smoothstep(0.544,0.554,p.y));
    art*=smoothstep(0.006,0.018,p.x)*(1.0-smoothstep(0.980,0.994,p.x));
    // Printed ability emblems and the small stamina numeral are untouched.
    art*=smoothstep(1.0,1.15,length((p-vec2(0.110,0.182))/vec2(0.060,0.041)));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.110,0.263))/vec2(0.060,0.042)));
    art*=smoothstep(1.0,1.20,length((p-vec2(0.153,0.286))/vec2(0.027,0.021)));
    vec3 color=base.rgb;
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    float cycle=mod(t*0.58+seed*0.7+0.8,7.0);
    float undead=smoothstep(4.4,5.3,cycle)*(1.0-smoothstep(6.1,7.0,cycle));
    float breath=0.5+0.5*sin(t*1.8+seed*6.2831853);
    vec3 chargeColor=mix(vec3(0.56,0.30,0.08),vec3(0.20,0.65,0.36),undead);
    float mace=oval(p,vec2(0.850,0.420),vec2(0.136,0.102));
    float face=oval(p,vec2(0.545,0.263),vec2(0.152,0.090));
    float metal=smoothstep(0.16,0.59,lum)*mace;
    color+=(1.0-color)*chargeColor*metal*(0.12+0.34*undead);

    // Five actual points of the spiked weapon hold the turn counters.
    float sparks=0.0;
    float halo=0.0;
    for(int i=0;i<5;i++) {
        float k=float(i);
        vec2 d=(p-chargePoint(k))*vec2(1.0,1.4113);
        float sparkActivity=0.19+0.81*smoothstep(k-0.15,k+0.35,cycle);
        float flicker=0.76+0.24*sin(t*2.8+k*1.7+seed*6.0);
        float core=1.0-smoothstep(0.0015,0.0045+aa,length(d));
        float rays=exp(-abs(d.x)/0.014-abs(d.y)/0.0028)
                  +exp(-abs(d.x)/0.0028-abs(d.y)/0.020);
        sparks+=(core+rays*0.4)*sparkActivity*flicker;
        halo+=exp(-dot(d,d)/0.00062)*sparkActivity*flicker;
    }
    color+=chargeColor*(sparks*0.85+halo*0.20);

    // Light crawls across the two bevels, never moving the printed artwork.
    float edge=min(lineDist(p,vec2(0.708,0.420),vec2(0.813,0.385)),
                   lineDist(p,vec2(0.813,0.385),vec2(0.925,0.367)));
    float edge2=lineDist(p,vec2(0.925,0.367),vec2(0.967,0.497));
    float bevel=1.0-smoothstep(0.001,0.003+aa,min(edge,edge2));
    float crawl=pow(0.5+0.5*sin(p.x*30.0-p.y*17.0-t*2.0),5.0);
    color+=chargeColor*bevel*(0.20+0.63*crawl);

    // Poison exhales up from the mace into the empty mountain sky.
    // Broad translucent ribbons remain visible at thumbnail size.
    float wisps=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float h=clamp((0.362-p.y)/0.205,0.0,1.0);
        float center=0.864+k*0.030+sin(h*8.0-t*0.85+k*1.7)*0.022*h;
        float width=0.007+h*0.012;
        float d=abs(p.x-center);
        float envelope=smoothstep(0.145,0.20,p.y)*(1.0-smoothstep(0.340,0.374,p.y));
        float flow=0.4+0.6*pow(0.5+0.5*sin(h*12.0-t*1.6+k),2.0);
        wisps+=exp(-d*d/(width*width))*envelope*flow;
    }
    color+=(1.0-color)*vec3(0.13,0.47,0.26)*wisps*(0.23+undead*0.65);
    float eyes=oval(p,vec2(0.514,0.228),vec2(0.022,0.009))
              +oval(p,vec2(0.603,0.225),vec2(0.016,0.008));
    color+=vec3(0.15,0.69,0.34)*eyes*(0.23+0.77*undead)*(0.74+0.26*breath);
    color=mix(color,color*vec3(0.84,1.04,0.99),face*undead*0.38);

    if(u_is_foil) {
        // Brushed bronze armour and polished mace carry broad interference
        // colours; the finish is deliberately present at frozen time zero.
        float shoulder=oval(p,vec2(0.205,0.431),vec2(0.220,0.150));
        float beard=oval(p,vec2(0.590,0.456),vec2(0.158,0.138));
        float foil=clamp(0.32+shoulder*0.48+mace*0.53+beard*0.21,0.0,0.95);
        foil*=1.0-face*0.83;
        float phase=p.x*1.65+p.y*2.35+0.12*sin(p.y*30.0+p.x*8.0)-t*0.10+seed*0.18;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        vec3 coated=mix(2.0*color*spectrum,
                        1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,coated,foil*0.48);
        float sheen=pow(0.5+0.5*sin(p.x*14.0+p.y*20.0-t*1.1),7.0);
        vec3 silver=mix(vec3(0.72,0.86,0.91),spectrum,0.52);
        color+=(1.0-color)*silver*foil*(0.12+0.46*sheen);
        color+=(1.0-color)*vec3(0.76,0.87,0.69)*bevel*(0.30+0.35*sheen);
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(color,0.0,1.0),art),base.a);
}
