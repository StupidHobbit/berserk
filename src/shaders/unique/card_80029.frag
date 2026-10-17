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

// Полководец Холверта: orders travel from the drawn sword through the ranks.
// All geometry uses the original 496 x 700 scan, with a top-left origin.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.70, 1.0, length((p-c)/r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
}
float hash(float x) { return fract(sin(x*127.1+93.7)*43758.5453); }

void main() {
    vec2 p = vec2(v_uv.x, 1.0-v_uv.y);
    vec4 original = texture2D(u_card, v_uv);
    float aa = max(1.0/max(u_resolution.x,1.0), 1.0/max(u_resolution.y,1.0));
    float t = u_time;
    float seed = u_seed*0.173;
    // Conservative lower boundary stops before the ornate statistic cartouches.
    float art = smoothstep(0.139,0.151,p.y)*(1.0-smoothstep(0.535,0.550,p.y));
    art *= smoothstep(0.006,0.023,p.x)*(1.0-smoothstep(0.977,0.994,p.x));
    // Hard interior exclusion includes the armor badge and its small numeral.
    float badge = smoothstep(0.180,0.192,p.x)+smoothstep(0.231,0.243,p.y);
    art *= clamp(badge,0.0,1.0);

    vec3 color = original.rgb;
    float luma = dot(original.rgb,vec3(0.2126,0.7152,0.0722));
    float body = oval(p,vec2(0.424,0.355),vec2(0.162,0.230));
    float face = oval(p,vec2(0.450,0.201),vec2(0.067,0.063));
    float steel = smoothstep(0.12,0.48,luma)
                *(1.0-smoothstep(0.05,0.22,abs(original.r-original.b)));

    // The two cloak wings breathe from their fixed shoulders. Original sampling
    // remains stationary, so the sword, face and printed frame never drift.
    float red = smoothstep(0.035,0.17,original.r-max(original.g,original.b));
    float wings = oval(p,vec2(0.169,0.424),vec2(0.20,0.18))
                + oval(p,vec2(0.795,0.472),vec2(0.28,0.10));
    float cloak = red*clamp(wings,0.0,1.0)*(1.0-body*0.85);
    float fold = sin(p.x*29.0+p.y*18.0-t*1.8+sin(p.y*22.0-t*0.65));
    color *= 1.0+cloak*fold*0.18;

    // Existing fires in the rear of the right-hand formation flicker in place.
    float fireZone = oval(p,vec2(0.845,0.274),vec2(0.24,0.058));
    float flame = fireZone*smoothstep(0.06,0.24,original.r-original.g);
    float flicker = 0.55+0.25*sin(t*7.0+p.x*74.0)+0.20*sin(t*11.3-p.x*43.0);
    color += vec3(0.24,0.075,0.009)*flame*flicker;
    float embers = 0.0;
    for (int i=0;i<16;i++) {
        float fi = float(i);
        float age = fract(t*(0.09+hash(fi+3.0)*0.08)+hash(fi+seed+7.0));
        vec2 e = vec2(0.66+0.33*hash(fi+1.7)+sin(t*0.6+fi)*age*0.016,
                      0.295-age*(0.07+0.08*hash(fi+8.0)));
        float radius = 0.0008+hash(fi+6.0)*0.0011;
        float d = length((p-e)*vec2(1.0,0.72));
        embers += (1.0-smoothstep(radius,radius+aa,d))*sin(age*3.141593)
                 *radius/(radius+aa*0.35);
    }
    color += vec3(0.65,0.22,0.035)*embers*(1.0-body);

    // Opening blade strike: a narrow glint travels along the actual blade,
    // followed by an amber command rolling outward across the helmet line.
    float cycle = fract(t/8.0+seed);
    float attack = 1.0-smoothstep(0.32,0.45,cycle);
    float defensive = smoothstep(0.40,0.52,cycle)*(1.0-smoothstep(0.88,1.0,cycle));
    vec2 bladeA = vec2(0.332,0.514);
    vec2 bladeB = vec2(0.759,0.574);
    vec2 bladeV = bladeB-bladeA;
    float bladeU = clamp(dot(p-bladeA,bladeV)/dot(bladeV,bladeV),0.0,1.0);
    float blade = 1.0-smoothstep(0.003,0.009+aa,lineDistance(p,bladeA,bladeB));
    float glint = exp(-pow((bladeU-fract(t*0.45+seed))/0.09,2.0));
    color += vec3(0.68,0.66,0.47)*blade*glint*(0.3+0.7*attack);
    float ranks = oval(p,vec2(0.790,0.353),vec2(0.29,0.09))
                +oval(p,vec2(0.129,0.341),vec2(0.16,0.072));
    float orderDistance = abs(p.x-0.44);
    float order = exp(-pow((orderDistance-cycle*1.3)/0.036,2.0));
    color += vec3(0.30,0.16,0.035)*order*attack*ranks*steel*(1.0-body);

    // Closed formation: three protective crescents follow the front soldiers'
    // shoulders. Their staggered breathing reads as a coordinated defensive line.
    float guard = 0.0;
    for (int i=0;i<3;i++) {
        float fi = float(i);
        vec2 c = vec2(0.641+fi*0.139,0.375+fi*0.008);
        vec2 q = (p-c)/vec2(0.065,0.063);
        float rim = abs(length(q)-1.0)*0.063;
        float arc = (1.0-smoothstep(0.001,0.002+aa,rim))
                  *(1.0-smoothstep(-0.05,0.38,q.y));
        guard += arc*(0.55+0.45*sin(t*2.0-fi*0.7));
    }
    color += vec3(0.10,0.25,0.30)*guard*defensive*(1.0-body);
    float armor = oval(p,vec2(0.424,0.337),vec2(0.14,0.105))*steel;
    color += vec3(0.06,0.11,0.14)*armor*defensive;

    if (u_is_foil) {
        // Brushed steel finish on armor and blade; silk interference on the cape.
        float phase = p.x*1.8+p.y*2.2+t*0.105+seed
                    +0.10*sin(p.x*14.0-p.y*18.0-t*0.8);
        vec3 spectrum = 0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float coating = (0.14+0.27*steel+0.13*cloak)*(1.0-face*0.93);
        vec3 overlay = mix(2.0*color*spectrum,
                           1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color = mix(color,overlay,coating);
        float sheen = pow(0.5+0.5*sin(p.x*10.0+p.y*7.0-t*1.4),16.0);
        color += (1.0-color)*mix(vec3(0.74,0.84,0.91),spectrum,0.34)
                 *sheen*steel*(0.12+0.13*armor)*(1.0-face);
    }
    color = mix(original.rgb,color,art);
    gl_FragColor = vec4(clamp(color,0.0,1.0),original.a);
}
