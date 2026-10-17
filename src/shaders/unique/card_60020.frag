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

// Орк-ведун: the war-drum heartbeat wakes his bone charm and travels up
// the carved crook. All landmarks refer to the original 496 x 700 scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.4,1.0,length((p-c)/r));
}
vec2 bend(vec2 a, vec2 b, vec2 c, float f) {
    return mix(mix(a,b,f),mix(b,c,f),f);
}
vec2 staff(float s) {
    float f=s*6.0;
    if (f<1.0) return bend(vec2(0.744,0.555),vec2(0.758,0.447),vec2(0.779,0.349),f);
    if (f<2.0) return bend(vec2(0.779,0.349),vec2(0.750,0.315),vec2(0.691,0.284),f-1.0);
    if (f<3.0) return bend(vec2(0.691,0.284),vec2(0.650,0.227),vec2(0.747,0.180),f-2.0);
    if (f<4.0) return bend(vec2(0.747,0.180),vec2(0.820,0.143),vec2(0.901,0.162),f-3.0);
    if (f<5.0) return bend(vec2(0.901,0.162),vec2(0.960,0.184),vec2(0.919,0.249),f-4.0);
    return bend(vec2(0.919,0.249),vec2(0.872,0.282),vec2(0.828,0.249),f-5.0);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137);
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.544,0.555,p.y));
    art*=smoothstep(0.006,0.020,p.x)*(1.0-smoothstep(0.980,0.994,p.x));
    // The two printed protection badges, including their outer shadows.
    art*=smoothstep(1.0,1.12,length((p-vec2(0.110,0.182))/vec2(0.061,0.041)));
    art*=smoothstep(1.0,1.12,length((p-vec2(0.110,0.261))/vec2(0.061,0.041)));
    vec3 color=scan.rgb;
    float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float face=oval(p,vec2(0.478,0.254),vec2(0.094,0.098));
    float hand=oval(p,vec2(0.772,0.468),vec2(0.070,0.060));
    float phase=t*0.25+seed*0.21;
    float beat=pow(0.5+0.5*cos(phase*6.2831853),12.0);
    float answer=pow(0.5+0.5*cos((phase-0.18)*6.2831853),18.0);
    float heartbeat=beat+0.65*answer;

    // Light follows the wooden silhouette, disappearing beneath the grip.
    float vein=0.0;
    float aura=0.0;
    float wood=0.0;
    for (int i=0;i<30;i++) {
        float s0=float(i)/30.0;
        vec2 a=staff(s0);
        vec2 b=staff(s0+1.0/30.0);
        vec2 ab=(b-a)*vec2(1.0,1.4113);
        vec2 ap=(p-a)*vec2(1.0,1.4113);
        float f=clamp(dot(ap,ab)/max(dot(ab,ab),0.000001),0.0,1.0);
        float d=length(ap-ab*f);
        float s=s0+f/30.0;
        float wave=fract(s-phase+0.5)-0.5;
        float wave2=fract(s-phase+0.69)-0.5;
        float charge=exp(-wave*wave/0.009)+0.55*exp(-wave2*wave2/0.004);
        float core=1.0-smoothstep(0.0014,0.0032+aa,d);
        vein=max(vein,core*(0.22+charge));
        aura=max(aura,exp(-d*d/0.00036)*(0.20+charge));
        wood=max(wood,1.0-smoothstep(0.011,0.030,d));
    }
    color+=vec3(0.43,0.23,0.063)*vein*(1.0-hand);
    color+=vec3(0.12,0.071,0.018)*aura*(1.0-hand);

    // The round bronze pendant and bird skull are the source of the rhythm.
    float coin=oval(p,vec2(0.495,0.405),vec2(0.030,0.025));
    float bone=oval(p,vec2(0.502,0.489),vec2(0.050,0.053));
    float ivory=smoothstep(0.22,0.65,luma)*bone;
    color+=vec3(0.33,0.19,0.052)*coin*(0.28+0.72*heartbeat);
    color+=vec3(0.13,0.20,0.16)*ivory*(0.25+heartbeat);
    float eyes=oval(p,vec2(0.484,0.480),vec2(0.009,0.011))
              +oval(p,vec2(0.521,0.480),vec2(0.009,0.011));
    color+=vec3(0.12,0.43,0.34)*eyes*(0.30+0.70*heartbeat);

    // Expanding drumbeats are revealed only in the open sky behind him.
    float sky=smoothstep(0.015,0.12,min(scan.g,scan.b)-scan.r);
    float radius=length((p-vec2(0.501,0.481))*vec2(1.0,1.4113));
    float rings=0.0;
    for (int i=0;i<3;i++) {
        float age=fract(phase+float(i)/3.0);
        float r=0.055+age*0.56;
        float d=abs(radius-r);
        rings+=(1.0-smoothstep(0.002,0.006+aa,d))*sin(age*3.14159265);
    }
    color+=vec3(0.045,0.20,0.16)*rings*sky*(1.0-face);

    // Turquoise spirit threads lift from the feathers tied to the crook.
    float feather=oval(p,vec2(0.906,0.410),vec2(0.073,0.058));
    float strands=pow(0.5+0.5*sin(p.x*148.0+p.y*70.0-t*3.0),8.0);
    color+=vec3(0.018,0.14,0.15)*feather*strands*(0.4+heartbeat*0.6);

    if (u_is_foil) {
        // A visible interference substrate, plus stronger metallic embossing
        // on the crook, bone and amulet, works even when time is fixed at zero.
        float foilPhase=p.x*1.8+p.y*2.4-t*0.14+seed*0.23;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(foilPhase+vec3(0.0,0.333,0.667)));
        vec3 overlay=mix(2.0*color*spectrum,
                        1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float finish=0.28*(1.0-face*0.75);
        color=mix(color,overlay,finish);
        float metal=clamp(wood*(1.0-hand)+coin+ivory+feather*0.6,0.0,1.0);
        float shine=pow(0.5+0.5*sin(p.x*17.0+p.y*21.0-t*1.2),8.0);
        vec3 reflection=mix(vec3(0.87,0.72,0.42),spectrum,0.58);
        color+=(1.0-color)*reflection*metal*(0.20+0.57*shine);
        color+=(1.0-color)*spectrum*(0.045+0.075*shine)*(1.0-face);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
